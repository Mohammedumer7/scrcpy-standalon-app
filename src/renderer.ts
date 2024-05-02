//@ts-nocheck
document.addEventListener('DOMContentLoaded', () => {
    window.electronAPI.onCast((data) => {
        console.log('Data received:', data);
        // Handle the data here
    });
});

