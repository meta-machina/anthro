// worker.js
let machineConfig = null;
let messages = null;
let llmSettings = null;


self.onmessage = async function(event) {
    // Parameters for the LLM API call from the main thread
    machineConfig = event.data.config;
    console.log('Worker received machine config:', machineConfig);
    llmSettings = event.data.settings;
    messages = event.data.messages;
    console.log('Worker received messages:', messages);


    try {
        // --- 2. Fetch instruction ---
        let instructionText; // Declare here to ensure it's in scope
        try {
            console.log('Worker: Fetching the Machine instruction from https://localhost');
            const instructionResponse = await fetch('https://localhost/' + machineConfig.instructions_file);
            if (!instructionResponse.ok) {
                 console.log(`Worker: HTTP error fetching instruction! status: ${instructionResponse.status}. Using default instruction.`);
                 // Default instruction if fetching fails or file not found
                 instructionText = "You are a helpful assistant.";
            } else {
                instructionText = (await instructionResponse.text()).trim();
                console.log('Worker: Instruction fetched successfully.');
                console.log('Worker: Instruction:', instructionText);
            }
        } catch (fetchError) {
            console.error('Worker: Error during instruction file fetch:', fetchError.message, '. Using default instruction.');
            instructionText = "You are a helpful assistant."; // Default instruction on any fetch error
        }

        // --- 3. Prepare messages for the API call ---
        const systemInstructionMessage = { role: "system", content: instructionText };
        let messagesForApi;

        // Check if the main thread sent any messages
        if (messages && Array.isArray(messages) && messages.length > 0) {
            // User provided messages: unshift/prepend the fetched system instruction
            messagesForApi = [systemInstructionMessage, ...messages];
            console.log('All messages for API:', messagesForApi)
        } else {
            // No messages from user, or an empty array: use the system instruction and a default user prompt
            messagesForApi = [
                systemInstructionMessage,
                { role: "user", content: "What model are you?" } // Default user prompt
            ];
        }

        // --- 4. Prepare the final API payload ---
        const defaultApiParameters = {
            model: llmSettings.model || machineConfig.llm,
            max_tokens: llmSettings.max_tokens || 4096,
            prompt_truncate_len: llmSettings.prompt_truncate_len || 10000,
            temperature: llmSettings.temperature || 1,
            top_p: llmSettings.top_p || 0.9,
            top_k: llmSettings.top_k || 50,
            frequency_penalty: 0,
            presence_penalty: 0,
            repetition_penalty: 1,
            n: 1,
            ignore_eos: false,
            stop: "stop",
            response_format: {"type":"text"},
            stream: false,
            context_length_exceeded_behavior: "truncate"
        };

        // Merge default parameters, then incoming user parameters (which might override temp, max_tokens, etc.),
        const finalApiPayload = {
            ...defaultApiParameters,
            messages: messagesForApi      // Ensure our carefully constructed messages array is used
        };
        console.log('Worker: Here is the final API payload:', finalApiPayload);


        // --- 5. Make the LLM API call ---
        //      --header "x-api-key: $ANTHROPIC_API_KEY" \
        //      --header "anthropic-version: 2023-06-01" \
        //      --header "content-type: application/json" \
        const apiOptions = {
            method: 'POST',
            headers: {
                'x-api-key': llmSettings.token,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalApiPayload)
        };

        console.log('Worker: Making API call to Fireworks API with payload:', finalApiPayload);
        const apiCallResponse = await fetch(machineConfig.apiUrl, apiOptions);

        if (!apiCallResponse.ok) {
            let errorDetails = await apiCallResponse.text();
            try {
                // Try to parse if the error response is JSON for more structured info
                errorDetails = JSON.parse(errorDetails);
            } catch (e) {
                // It's not JSON, use the raw text
            }
            console.error('Worker: API Error Response:', errorDetails);
            throw new Error(`API Error: ${apiCallResponse.status} - ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`);
        }

        const apiData = await apiCallResponse.json();
        console.log('Worker: API call successful, response:', apiData);

        const msgResponse = apiData.choices[0].message // meta's response text in its content.text of it

        // Send the successful result back to the main thread
        self.postMessage({ type: 'success', data: msgResponse });

    } catch (error) {
        console.error('Worker: An error occurred:', error.message, error); // Log the full error object for more details
        // Send the error back to the main thread
        self.postMessage({ type: 'error', error: error.message });
    }
};

console.log('Worker: Script loaded and ready for messages.');
