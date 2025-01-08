// Test URL with known date 2025-09-26
const url = 'https://www.google.com/travel/flights/search?tfs=CBwQAhopEgoyMDI1LTA5LTI2ag0IAxIJL20vMDFweTg3cgwIAxIIL20vMDZnbXJAAUgBcAGCAQsI____________AZgBAg&tfu=EgoIABAAGAAgAigB';

function changeDateInUrl(url, oldDate, newDate) {
    // Extract the tfs parameter
    const tfsMatch = url.match(/tfs=([^&]*)/);
    if (!tfsMatch) return url;

    const tfsValue = tfsMatch[1];
    
    // Try to decode the base64
    try {
        const decoded = Buffer.from(tfsValue, 'base64').toString('binary');
        console.log('Decoded value:', decoded);
        
        // Find the date in the decoded string
        const datePattern = new RegExp(oldDate.replace(/-/g, '[-]?'));
        const dateMatch = decoded.match(datePattern);
        
        if (dateMatch) {
            console.log('Found date:', dateMatch[0]);
            // Replace the date
            const newDecoded = decoded.replace(dateMatch[0], newDate);
            // Encode back to base64, remove padding and restore underscores
            const newTfsValue = Buffer.from(newDecoded, 'binary')
                .toString('base64')
                .replace(/=+$/, '')  // Remove padding
                .replace(/\//g, '_'); // Replace forward slashes with underscores
            // Replace in URL
            return url.replace(tfsValue, newTfsValue);
        }
    } catch (e) {
        console.log('Error decoding base64:', e);
    }
    
    console.log('Could not find date pattern in URL');
    return url;
}

// Test the function
console.log('Original URL:', url);
console.log('\nTrying to change date from 2025-09-26 to 2025-09-27...');
const newUrl = changeDateInUrl(url, '2025-09-26', '2025-09-27');
console.log('\nNew URL:', newUrl);

// Verify the change worked
console.log('\nVerifying the change:');
console.log('Old date exists in original URL:', url.includes('2025-09-26'));
console.log('New date exists in new URL:', newUrl.includes('2025-09-27')); 