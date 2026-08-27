const StorageManager = {
  getCurrentUser() {
    return sessionStorage.getItem('user_email') || 'guest';
  },

  getKey() {
    const user = this.getCurrentUser();
    return `ops_board_items_${user}`;
  },

  loadItems() {
    const key = this.getKey();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse local storage for user', e);
      return null;
    }
  },

  saveItems(items) {
    const key = this.getKey();
    localStorage.setItem(key, JSON.stringify(items));
  },

  handleLoginTransition(email) {
    sessionStorage.setItem('user_email', email);

    const oldKey = 'ops_board_items_guest';
    const newKey = this.getKey(); 
    
    if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
    }
  }
};