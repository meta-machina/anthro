import { platoHtmlToPlatoText, platoTextToPlatoHtml, platoHtmlToCmj,
  CmjToPlatoText, llmSoupToText } from './utilities.mjs';
import { showTokenPopup, hideTokenPopup } from './token_popup.mjs';


document.addEventListener('DOMContentLoaded', () => {
  const configElement = document.getElementById('machina-config');
  if (configElement) {
    const machineSettings = JSON.parse(configElement.dataset.machineSettings);
    const githubSettings = JSON.parse(configElement.dataset.githubSettings);
    const llmSettings = JSON.parse(configElement.dataset.lmSettings);
    const appSettings = JSON.parse(configElement.dataset.appSettings);
    const workerUrl = configElement.dataset.workerUrl;
    
    // fireworks weirdness
    llmSettings.model = 'accounts/fireworks/models/' + llmSettings.model;
    
    console.log('Machina settings loaded:', machineSettings);
    console.log('GitHub settings loaded:', githubSettings);
    console.log('LLM settings loaded:', llmSettings);
    console.log('App settings loaded:', appSettings);
    console.log('Worker URL loaded:', workerUrl);
    
    const queryParams = new URLSearchParams(window.location.search);
    
    // Iterate over query parameters found in the URL
    for (const [key, value] of queryParams.entries()) {
      // Basic type conversion for known numeric fields
      if (['temperature', 'top_p'].includes(key)) {
        const numValue = parseFloat(value);
        llmSettings[key] = isNaN(numValue) ? value : numValue;
      } else if (['max_tokens', 'prompt_truncate_len', 'top_k'].includes(key)) {
        const numValue = parseInt(value, 10);
        llmSettings[key] = isNaN(numValue) ? value : numValue;
      } else {
        // fireworks ugliness
        if (key === 'model') {
        llmSettings[key] = 'accounts/fireworks/models/' + value;
        } else {
          llmSettings[key] = value;
        }
      }
    }
    
    // Make the parameters globally available for other scripts
    console.log('LLM Settings:', llmSettings)
    
    // Check whether the page has the container.
    const contentContainer = document.querySelector('.container-md.markdown-body');
    if (!contentContainer) {
      console.error('Main content container (.container-md.markdown-body) not found.');
      return;
    }
    // Check whether the page has a header.
    const h1Element = contentContainer.querySelector('h1');
    if (!h1Element) {
      console.error('H1 element not found. UI elements might be misplaced.');
    }
    
    // Get references to the UI elements from the DOM
    const dialogueWrapper = document.getElementById('dialogue-content-wrapper');
    const textarea = document.getElementById('dialogue-editor-textarea');
    const filePickerContainer = document.getElementById('file-picker-container');
    const chooseFileButton = document.getElementById('chooseFileButton');
    const tokenPopupSaveButton = document.getElementById('tokenPopupSaveButton');
    const tokenPopupCancelButton = document.getElementById('tokenPopupCancelButton');
    
    // Make the dialogue wrapper programmatically focusable
    dialogueWrapper.setAttribute('tabindex', '-1');
    dialogueWrapper.style.outline = 'none'; // Hide the visual focus indicator on the div
    
    tokenPopupSaveButton.addEventListener('click', async () => {
      const tokenInputVal = document.getElementById('tokenPopupInput').value;
      if (tokenInputVal && tokenInputVal.trim()) {
        llmSettings.token = tokenInputVal.trim();
        console.log('Token set manually via pop-up.');
        hideTokenPopup();
      } else {
        alert('Enter an API token.');
      }
    });
    tokenPopupCancelButton.addEventListener('click', () => {
      hideTokenPopup();
      console.log('Token entry cancelled by user.');
    });
    
    // 6. Function to update display based on localStorage content
    function updateDisplayState() {
      const currentPlatoText = localStorage.getItem('multilogue');
      // If there is some text.
      if (currentPlatoText && currentPlatoText.trim() !== '') {
        try {
          dialogueWrapper.innerHTML = platoTextToPlatoHtml(currentPlatoText);
        } catch (e) {
          console.error("Error rendering Plato text to HTML:", e);
          dialogueWrapper.innerHTML = "<p class='dialogue-error'>Error loading content. Please try editing or loading a new file.</p>";
        }
        dialogueWrapper.style.display = 'block';
        textarea.style.display = 'none';
        filePickerContainer.style.display = 'none';
        // Scroll to the bottom of the dialogue content after it's updated and shown
        dialogueWrapper.scrollIntoView({behavior: 'smooth', block: 'end'});
        
        // This ensures the page can receive keyboard events after an automatic update.
        dialogueWrapper.focus({ preventScroll: true });
      
      } else {
        // No valid content, show file picker
        dialogueWrapper.style.display = 'none';
        textarea.style.display = 'none';
        filePickerContainer.style.display = 'flex'; // Use flex to enable centering
        dialogueWrapper.innerHTML = ''; // Clear any old content
        textarea.value = ''; // Clear textarea
      }
    }
    
    // Initial display update
    updateDisplayState();
    
    // 7. Event listener for "Choose File" button
    chooseFileButton.addEventListener('click', async () => {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [{
            description: 'Text Files',
            accept: {
              'text/plain': ['.txt', '.md', '.text', '.plato'],
            }
          }]
        });
        const file = await fileHandle.getFile();
        const fileContent = await file.text();
        
        localStorage.setItem('multilogue', fileContent);
        // No need to set textarea.value here, updateDisplayState will handle if we switch to editor
        // OR, if we want to go directly to editor:
        textarea.value = fileContent;
        dialogueWrapper.style.display = 'none';
        filePickerContainer.style.display = 'none';
        textarea.style.display = 'block';
        textarea.focus();
        // If not going directly to editor, just call updateDisplayState()
        // updateDisplayState();
      } catch (err) {
        if (err.name !== 'AbortError') { // User cancelled picker
          console.error('Error opening file:', err);
          alert(`Error opening file: ${err.message}`);
        }
      }
    });
    // 8. Event listener to switch to edit mode when dialogue content is clicked
    dialogueWrapper.addEventListener('click', () => {
      try {
        // Convert the current HTML to plain text.
        textarea.value = platoHtmlToPlatoText(dialogueWrapper.innerHTML);
        dialogueWrapper.style.display = 'none';
        textarea.style.display = 'block';
        filePickerContainer.style.display = 'none';
        textarea.focus();
      } catch (e) {
        console.error("Error converting HTML to text for editing:", e);
        alert("Could not switch to edit mode due to a content error.");
      }
    });
    // 9. Event listener for saving (Ctrl+Enter) in the textarea
    textarea.addEventListener('keydown', (event) => {
      if (event.ctrlKey && !event.shiftKey && event.key === 'Enter') { // Changed from Shift to Enter as per original request context
        event.preventDefault();
        const newText = textarea.value;
        localStorage.setItem('multilogue', newText);
        updateDisplayState(); // Update display, which will show dialogue or button
      }
    });
    
    // 11. Event listener for saving to file (Ctrl+Shift+Enter) - Always "Save As"
    document.addEventListener('keydown', async (event) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'Enter') {
        event.preventDefault();
        const textToSave = localStorage.getItem('multilogue') || '';
        if (!textToSave.trim()) {
          console.log('Ctrl+Shift+Enter: Dialogue content is empty. Nothing to save.');
          alert('Dialogue is empty. Nothing to save.');
          return; // Prevent saving an empty file
        }
        try {
          // Always prompt "Save As"
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: 'dialogue.txt', // You can customize the suggested name
            types: [{
              description: 'Text Files',
              accept: {
                'text/plain': ['.txt', '.md', '.text', '.plato'],
              },
            }],
          });
          // Create a FileSystemWritableFileStream to write to.
          const writable = await fileHandle.createWritable();
          // Write the contents of the file to the stream.
          await writable.write(textToSave);
          // Close the file and write the contents to disk.
          await writable.close();
          // If file save was successful, then update localStorage
          localStorage.setItem('multilogue', textToSave);
          updateDisplayState(); // Refresh the view
          
        } catch (err) {
          // Handle errors, e.g., if the user cancels the save dialog
          if (err.name !== 'AbortError') {
            console.error('Error saving file:', err);
            alert(`Could not save file: ${err.message}`);
          }
        }
      }
    });
    
    // 12. Event listener for LLM communications (Alt+Shift)
    document.addEventListener('keydown', async function (event) {
      if (event.altKey && event.shiftKey) {
        event.preventDefault();
        if (!llmSettings.token) {
          console.log('Token not found. Attempting to fetch from: https://localhost/' + machineSettings.token);
          try {
            const tokenResponse = await fetch('https://localhost/' + machineSettings.token);
            if (!tokenResponse.ok) {
              throw new Error(tokenResponse.status);
            } else {
              const fetchedToken = (await tokenResponse.text()).trim();
              llmSettings.token = fetchedToken;
              console.log('Token fetched successfully from server.');
            }
          } catch (fetchError) {
            console.error('Token fetch failed:', fetchError.message);
            showTokenPopup(); // Show pop-up to ask for token
            return; // Stop further execution in this handler, wait for pop-up interaction
          }
        }
        
        const htmlContent = dialogueWrapper.innerHTML;
        if (!htmlContent || htmlContent.trim() === '') {
          console.log('Alt+Shift: Dialogue content is empty. Nothing to send.');
          alert('Dialogue is empty. Please add some content first.');
          return;
        }
        
        console.log('Alt+Shift pressed. Preparing to send dialogue to LLM worker...');
        
        try {
          const cmjMessages = platoHtmlToCmj(htmlContent);
          
          const userQueryParameters = {
            config: machineSettings,
            settings: llmSettings,
            messages: cmjMessages
          };
          
          console.log('Alt+Shift: Launching LLM worker with CMJ messages:', userQueryParameters);
          
          document.getElementById('loading-overlay').style.display = 'flex'; // Show loader
          const llmWorker = new Worker(workerUrl);
          
          llmWorker.onmessage = function (e) {
            document.getElementById('loading-overlay').style.display = 'none'; // Hide loader
            console.log('Main thread: Message received from worker:', e.data);
            if (e.data.type === 'success') {
              console.log('Worker task successful. LLM Response:', e.data.data);
              
              try {
                const llmResponseData = e.data.data;
                if (!llmResponseData || !llmResponseData || llmResponseData.content.length === 0) {
                  console.error('LLM response is missing a message content.');
                  alert('Received an empty or invalid response from the LLM.');
                  return;
                }
                
                console.log('Initial llmResponseData:', llmResponseData)
                const desoupedText = llmSoupToText(llmResponseData.content.trim());
                
                const newCmjMessage = {
                  role: llmResponseData.role,
                  name: machineSettings.name,
                  content: desoupedText
                };
                
                // cmjMessages (from the outer scope of the Alt+Shift listener) is updated
                cmjMessages.push(newCmjMessage);
                
                // CmjToPlatoText is global
                const updatedPlatoText = CmjToPlatoText(cmjMessages);
                if (typeof updatedPlatoText !== 'string') {
                  console.error('Failed to convert updated CMJ to PlatoText.');
                  alert('Error processing the LLM response for display.');
                  return;
                }
                
                localStorage.setItem('multilogue', updatedPlatoText);
                
                // updateDisplayState
                updateDisplayState();
                console.log('Dialogue updated with LLM response.');
                
              } catch (processingError) {
                console.error('Error processing LLM response:', processingError);
                alert('An error occurred while processing the LLM response: ' + processingError.message);
              }
              
            } else if (e.data.type === 'error') {
              console.error('Main thread: Error message from worker:', e.data.error);
              alert('Worker reported an error: ' + e.data.error);
            }
          };
          
          llmWorker.onerror = function (error) {
            document.getElementById('loading-overlay').style.display = 'none'; // Hide loader on error too
            console.error('Main thread: An error occurred with the worker script:', error.message, error);
            alert('Failed to initialize or run worker: ' + error.message);
          };
          
          llmWorker.postMessage(userQueryParameters);
          console.log('Main thread: Worker launched and CMJ messages sent.');
          
        } catch (e) {
          console.error('Alt+Shift: Failed to process dialogue or communicate with the worker:', e);
          alert('Error preparing data for LLM: ' + e.message);
        }
      }
    });
    
    // 14. Update multilogue display from the localStorage
    window.addEventListener('localStorageChanged', function() {
      console.log('Received localStorageChanged event. Triggering multilogue update.');
      updateDisplayState();
      
    });
    
    // 13 Event listener for remote trigger from Chrome extension
    window.addEventListener('runMachineCommand', async function() { // Make the function async
      console.log('Received runMachineCommand event. Triggering LLM interaction.');
      try {
        // runMachine();
        console.log('Run Machine Command received.');
        dialogueWrapper.focus({ preventScroll: true });
      } catch (error) { // Catch any errors from runMachine
        console.error('LLM interaction failed (runMachineCommand):', error.message);
      }
    });
    
    // 14. Update display when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // console.log('Page is now visible, ensuring display is up to date.');
        if (typeof updateDisplayState === 'function') {
          updateDisplayState();
        } else {
          console.warn('Page Script (visibilitychange): updateDisplayState function not found.');
        }
      }
    });
  } else {
    console.log('This is not a machine page.')
    return
  }
});
