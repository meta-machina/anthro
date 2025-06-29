(function () {
  /**
   * A helper function to wrap a localStorage method.
   * It calls the original method and then dispatches a 'localStorageChanged' event.
   * @param {string} methodName The name of the method to wrap ('setItem', 'removeItem', 'clear').
   * @param {Function} originalMethod The original localStorage method.
   * @returns {Function} The new, wrapped function.
   */
  function wrapStorageMethod(methodName, originalMethod) {
    return function(...args) {
      const key = args[0];
      const value = args[1]; // The new value for setItem
      let oldValue = null;
      
      // For 'setItem' and 'removeItem', get the value *before* the operation.
      if (methodName !== 'clear') {
        oldValue = localStorage.getItem(key);
      }
      
      // Call the original localStorage method to perform the action.
      const result = originalMethod.apply(this, args);
      
      // Create the event payload, maintaining the original 'value' property.
      const eventDetail = {
        type: methodName,
        key: key,
        value: methodName === 'setItem' ? value : null, // Keep 'value' for compatibility
        oldValue: oldValue,                              // Add the new 'oldValue' enhancement
        timestamp: Date.now()
      };
      
      // For 'clear', the key/value details are not relevant.
      if (methodName === 'clear') {
        delete eventDetail.key;
        delete eventDetail.value;
        delete eventDetail.oldValue;
      }
      
      // Dispatch the custom event so the app and extension can react.
      window.dispatchEvent(new CustomEvent('localStorageChanged', {
        detail: eventDetail
      }));
      
      // Return the result of the original call, just in case.
      return result;
    };
  }
  
  // Override the native methods with our new, enhanced versions.
  localStorage.setItem = wrapStorageMethod('setItem', localStorage.setItem);
  localStorage.removeItem = wrapStorageMethod('removeItem', localStorage.removeItem);
  localStorage.clear = wrapStorageMethod('clear', localStorage.clear);
  
})();