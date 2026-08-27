// ==========================================
// 1. INITIALIZATION & STATE
// ==========================================

let items = StorageManager.loadItems() || [
  { id: '1', title: 'Welcome Card', description: 'Get started by creating a new card.' }
];

function persistAndRender() {
  StorageManager.saveItems(items);
  render();
}

function render() {
  console.log('Rendering board items:', items);
  // Your code to draw cards to the DOM goes here...
}

function updateSessionUI() {
  console.log('Session UI updated for:', StorageManager.getCurrentUser());
  // Your code to update the button text or user profile display goes here...
}


// ==========================================
// 2. GOOGLE IDENTITY SERVICES AUTH HANDLER
// ==========================================

function handleGoogleAuthSuccess(token) {
  fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(user => {
    if (user.email) {
      StorageManager.handleLoginTransition(user.email);
      items = StorageManager.loadItems() || items; 
      render();
      updateSessionUI();
    }
  })
  .catch(err => console.error('Failed to fetch user profile', err));
}