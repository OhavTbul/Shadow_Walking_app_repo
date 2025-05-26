// ========================================
//          app.js
// ========================================

let favorites = [];
let selectedFav = null;

function showLogin() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTabButton = document.getElementById('loginTab');
  const registerTabButton = document.getElementById('registerTab');
  const messageDiv = document.getElementById('message');

  if (loginForm) loginForm.style.display = 'block';
  if (registerForm) registerForm.style.display = 'none';
  if (loginTabButton) loginTabButton.classList.add('active');
  if (registerTabButton) registerTabButton.classList.remove('active');
  if (messageDiv) messageDiv.innerText = '';
}

function showRegister() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTabButton = document.getElementById('loginTab');
  const registerTabButton = document.getElementById('registerTab');
  const messageDiv = document.getElementById('message');

  if (loginForm) loginForm.style.display = 'none';
  if (registerForm) registerForm.style.display = 'block';
  if (loginTabButton) loginTabButton.classList.remove('active');
  if (registerTabButton) registerTabButton.classList.add('active');
  if (messageDiv) messageDiv.innerText = '';
}

function showUserMessage(messageElement, msg, isError, clearAfter = 5000) {
  if (messageElement) {
    messageElement.style.color = isError ? 'var(--danger-color)' : 'var(--primary-color)';
    messageElement.innerText = msg;
    if (clearAfter > 0) {
        setTimeout(() => {
            if (messageElement.innerText === msg) {
                messageElement.innerText = '';
            }
        }, clearAfter);
    }
  } else {
    console.warn("showUserMessage: Message element was not provided or found.");
  }
}

function updateUserSpecificFeatures(isLoggedIn) {
    console.log("updateUserSpecificFeatures - isLoggedIn:", isLoggedIn);

    const tabCompareButton = document.getElementById('tabCompare');
    console.log("Inside updateUserSpecificFeatures - tabCompareButton element IS:", tabCompareButton);
    const tabFutureButton = document.getElementById('tabFuture');
    const tabFavoritesButton = document.getElementById('tabFavorites');

    const favElements = [
        document.getElementById('favOriginNameSheet'),
        document.getElementById('favDestNameSheet'),
        document.getElementById('saveFavBtnSheet'),
        document.getElementById('favListSheet'),
        document.getElementById('calcFavBtnSheet'),
        document.getElementById('deleteFavBtnSheet')
    ];

    if (isLoggedIn) {
        console.log("User is logged in - showing registered-user tabs and features.");

        if (tabCompareButton) {
            console.log("tabCompareButton FOUND. Current classes BEFORE remove:", tabCompareButton.classList.toString());
            tabCompareButton.classList.remove('hidden');
            console.log("tabCompareButton classes AFTER remove:", tabCompareButton.classList.toString());
        } else {
            console.log("tabCompareButton IS NULL - cannot remove 'hidden'.");
        }

        if (tabFutureButton) {
            tabFutureButton.classList.remove('hidden');
        }

        if (tabFavoritesButton) {
            tabFavoritesButton.classList.remove('hidden');
        }

        favElements.forEach(el => {
            if (el) el.style.display = (el.tagName === 'SELECT' || el.tagName === 'INPUT') ? 'block' : 'inline-block';
        });

    } else { // משתמש לא מחובר
        console.log("User is NOT logged in - hiding registered-user tabs and features.");
        const tabsToHide = [tabCompareButton, tabFutureButton, tabFavoritesButton];
        let mainTabActivated = false;

        tabsToHide.forEach(tabBtn => {
            if (tabBtn) {
                if (tabBtn.classList.contains('active')) {
                    const tabRouteButton = document.getElementById('tabRoute');
                    if (tabRouteButton && !mainTabActivated) {
                        // We'll call click on tabRouteButton after this loop and after setting 'hidden'
                        mainTabActivated = true; // Mark that we need to switch
                        console.log("User logged out from a restricted tab, will switch to Route tab.");
                    }
                }
                tabBtn.classList.add('hidden');
            }
        });

        const tabRouteButton = document.getElementById('tabRoute');
        if (mainTabActivated && tabRouteButton && !tabRouteButton.classList.contains('active')) {
             // Defer click to ensure it happens after all class changes and in a clean stack
            setTimeout(() => tabRouteButton.click(), 0);
        } else if (tabRouteButton && !tabRouteButton.classList.contains('active') && !mainTabActivated) {
            setTimeout(() => tabRouteButton.click(), 0);
        }


        favElements.forEach(el => {
            if (el) el.style.display = 'none';
            if (el && (el.id === 'calcFavBtnSheet' || el.id === 'deleteFavBtnSheet')) el.disabled = true;
        });
        const favListSelect = document.getElementById('favListSheet');
        if (favListSelect) favListSelect.innerHTML = '';
        favorites = [];
        selectedFav = null;
    }
}

function loginSuccess(name) {
  const authModalContainer = document.getElementById('authModalContainer');
  const openAuthModalBtn = document.getElementById('openAuthModalBtn');
  const topBar = document.getElementById('topBar');

  if (authModalContainer) authModalContainer.style.display = 'none';
  if (openAuthModalBtn) openAuthModalBtn.style.display = 'none';

  if (topBar) {
    topBar.classList.remove('hidden');
    topBar.innerHTML = `Hello, <span class="username-display">${name}</span>!
          <button type="button" id="logoutBtn" class="button-gradient button-auth-logout">Logout</button>`;
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
  }
  updateUserSpecificFeatures(true);
}

function logout() {
  sessionStorage.removeItem('currentUser');
  const openAuthModalBtn = document.getElementById('openAuthModalBtn');
  const topBar = document.getElementById('topBar');
  if (openAuthModalBtn) openAuthModalBtn.style.display = 'inline-block';
  if (topBar) topBar.classList.add('hidden');

  updateUserSpecificFeatures(false); // קריטי!

  if (window.mapManager) {
      if (typeof window.mapManager.clearRouteDisplay === 'function') window.mapManager.clearRouteDisplay();
      if (typeof window.mapManager.clearComparisonDisplay === 'function') window.mapManager.clearComparisonDisplay();
      if (window.mapManager.startMarker) { window.mapManager.startMarker.remove(); window.mapManager.startMarker = null; }
      if (window.mapManager.endMarker) { window.mapManager.endMarker.remove(); window.mapManager.endMarker = null; }
      window.mapManager.startPointCoords = null;
      window.mapManager.endPointCoords = null;
  }
  const routeInfoSection = document.getElementById('routeInfoSectionSheet');
  if(routeInfoSection) routeInfoSection.classList.add('hidden');

  const bottomSheet = document.getElementById('bottomSheet');
  if (bottomSheet && bottomSheet.classList.contains('expanded')) {
      bottomSheet.classList.remove('expanded');
  }
  console.log("User logged out.");
}

async function registerUser(event) {
  event.preventDefault();
  const regFirstName = document.getElementById('regFirstName');
  const regLastName = document.getElementById('regLastName');
  const regEmail = document.getElementById('regEmail');
  const regPassword = document.getElementById('regPassword');
  const messageDiv = document.getElementById('message');

  if (!regFirstName || !regLastName || !regEmail || !regPassword) {
      if (messageDiv) showUserMessage(messageDiv, 'Registration form elements not found.', true);
      return;
  }
  try {
      const res = await fetch('/register', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          first_name: regFirstName.value.trim(),
          last_name: regLastName.value.trim(),
          email: regEmail.value.trim(),
          password: regPassword.value.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      if (messageDiv) showUserMessage(messageDiv, data.message || 'Registration successful! You can now login.', false);
      event.target.reset();
      showLogin();
  } catch (error) {
      console.error("Registration error:", error);
      if (messageDiv) showUserMessage(messageDiv, error.message, true);
  }
}

async function loginUser(event) {
  event.preventDefault();
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const messageDiv = document.getElementById('message');

  if (!loginEmail || !loginPassword) {
       if (messageDiv) showUserMessage(messageDiv, 'Login form elements not found.', true);
       return;
  }
  try {
      const res = await fetch('/login', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: loginEmail.value.trim(),
          password: loginPassword.value.trim()
        })
      });
      const data = await res.json();
       if (!res.ok) throw new Error(data.error || 'Login failed');

      sessionStorage.setItem('currentUser', JSON.stringify({firstName: data.first_name, id: data.user_id || data.id }));
      loginSuccess(data.first_name);
      event.target.reset();
  } catch(error) {
       console.error("Login error:", error);
       if (messageDiv) showUserMessage(messageDiv, error.message, true);
  }
}

async function loadFavorites() {
  const favListSelect = document.getElementById('favListSheet');
  const calcFavBtnSheet = document.getElementById('calcFavBtnSheet');
  const deleteFavBtnSheet = document.getElementById('deleteFavBtnSheet');
  const favoritesStatusMessage = document.querySelector('#favoritesTabContent .status-message');

  if (!sessionStorage.getItem('currentUser')) {
      console.log("loadFavorites: User not logged in, skipping.");
      if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "Please login to see favorites.", true, 0);
      return;
  }
  if (!favListSelect || !calcFavBtnSheet || !deleteFavBtnSheet) {
      console.warn("loadFavorites: One or more UI elements for favorites are missing.");
      return;
  }

  try {
    if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "Loading favorites...", false, 0);
    const res = await fetch('/api/favorites');
    if (!res.ok) {
        if (res.status === 401) {
             console.warn("loadFavorites: Unauthorized (401) from server.");
             if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "Session expired. Please login again.", true, 0);
             updateUserSpecificFeatures(false);
             return;
        }
        const errorData = await res.json().catch(() => ({error: `HTTP error ${res.status}`}));
        throw new Error(errorData.error || `Failed to load favorites: ${res.statusText}`);
    }

    favorites = await res.json();
    favListSelect.innerHTML = '';

    if (!Array.isArray(favorites) || favorites.length === 0) {
      console.log("No favorites found for this user.");
      favListSelect.style.display = 'none';
      calcFavBtnSheet.style.display = 'none'; calcFavBtnSheet.disabled = true;
      deleteFavBtnSheet.style.display = 'none'; deleteFavBtnSheet.disabled = true;
      selectedFav = null;
      if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "No favorites saved yet.", false);
      return;
    }

    console.log("Favorites loaded:", favorites);
    favListSelect.style.display = 'block';
    calcFavBtnSheet.style.display = 'inline-block';
    deleteFavBtnSheet.style.display = 'inline-block';

    favorites.forEach((f, index) => {
      const opt = document.createElement('option');
      opt.value = index;
      const originName = f.origin_name || `[${parseFloat(f.origin[0]).toFixed(3)},${parseFloat(f.origin[1]).toFixed(3)}]`;
      const destName = f.dest_name || `[${parseFloat(f.dest[0]).toFixed(3)},${parseFloat(f.dest[1]).toFixed(3)}]`;
      opt.text = `${originName} ↔ ${destName}`;
      favListSelect.appendChild(opt);
    });

    if (favorites.length > 0) {
        favListSelect.selectedIndex = 0;
        selectedFav = favorites[0];
    } else {
        selectedFav = null;
    }
    calcFavBtnSheet.disabled = !selectedFav;
    deleteFavBtnSheet.disabled = !selectedFav;

    if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, `${favorites.length} favorite(s) loaded.`, false);

  } catch (err) {
    console.error('Failed loading favorites:', err);
    if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, `Error: ${err.message}`, true);
    favListSelect.style.display = 'none';
    calcFavBtnSheet.style.display = 'none'; calcFavBtnSheet.disabled = true;
    deleteFavBtnSheet.style.display = 'none'; deleteFavBtnSheet.disabled = true;
  }
}

async function saveFavorite() {
    const favOriginEl = document.getElementById('favOriginNameSheet');
    const favDestEl = document.getElementById('favDestNameSheet');
    const favoritesStatusMessage = document.querySelector('#favoritesTabContent .status-message');

    // Validate that both fields have values
    if (!favOriginEl.value.trim() || !favDestEl.value.trim()) {
        if (favoritesStatusMessage) {
            favoritesStatusMessage.style.color = '#dc2626'; // Error color (red)
            favoritesStatusMessage.textContent = 'Please enter names for both points';
        }
        return;
    }

    if (!window.mapManager || !window.mapManager.getCurrentPoints) {
        if(favoritesStatusMessage) {
            favoritesStatusMessage.style.color = '#dc2626';
            favoritesStatusMessage.textContent = "Map is not ready.";
        }
        return;
    }

    const { start, dest } = window.mapManager.getCurrentPoints();
    if (!start || !dest) {
        if(favoritesStatusMessage) {
            favoritesStatusMessage.style.color = '#dc2626';
            favoritesStatusMessage.textContent = "Set start and end points first.";
        }
        return;
    }

    try {
        const body = {
            origin: [start.lat, start.lng],
            dest: [dest.lat, dest.lng],
            origin_name: favOriginEl.value.trim(),
            dest_name: favDestEl.value.trim()
        };

        if (favoritesStatusMessage) {
            favoritesStatusMessage.style.color = '#4b5563';
            favoritesStatusMessage.textContent = "Saving favorite...";
        }

        const res = await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to save favorite.`);

        favOriginEl.value = '';
        favDestEl.value = '';
        await loadFavorites();

        if (favoritesStatusMessage) {
            favoritesStatusMessage.style.color = '#059669'; // Success color (green)
            favoritesStatusMessage.textContent = "Favorite saved successfully!";
            setTimeout(() => switchFavoritesSection('view'), 1500);
        }
    } catch (error) {
        console.error("Error saving favorite:", error);
        if (favoritesStatusMessage) {
            favoritesStatusMessage.style.color = '#dc2626';
            favoritesStatusMessage.textContent = error.message;
        }
    }
}

function useFavorite() {
     const calcFavBtnSheet = document.getElementById('calcFavBtnSheet');
     if (!selectedFav || !window.mapManager || !calcFavBtnSheet || calcFavBtnSheet.disabled) return;

     if (!Array.isArray(selectedFav.origin) || selectedFav.origin.length < 2 ||
         !Array.isArray(selectedFav.dest) || selectedFav.dest.length < 2) {
         alert("Selected favorite has invalid coordinate data."); return;
     }
    const startLatLng = { lng: parseFloat(selectedFav.origin[1]), lat: parseFloat(selectedFav.origin[0]) };
    const destLatLng = { lng: parseFloat(selectedFav.dest[1]), lat: parseFloat(selectedFav.dest[0]) };

    window.mapManager.setStartPoint(startLatLng);
    window.mapManager.setEndPoint(destLatLng);
    window.mapManager.isSettingPoints = false;
    window.mapManager.updateSetPointsButtonState(false);
    window.mapManager.calculateRoute();

    const tabRouteButton = document.getElementById('tabRoute');
    if (tabRouteButton && !tabRouteButton.classList.contains('active')) {
        tabRouteButton.click();
    }
}

async function deleteFavorite() {
    const deleteFavBtnSheet = document.getElementById('deleteFavBtnSheet');
    const favoritesStatusMessage = document.querySelector('#favoritesTabContent .status-message');

    if (!selectedFav || !deleteFavBtnSheet || deleteFavBtnSheet.disabled) return;
    const favNameToDelete = document.getElementById('favListSheet').options[document.getElementById('favListSheet').selectedIndex].text;
    if (!confirm(`Are you sure you want to delete the favorite: "${favNameToDelete}"?`)) return;

    if (!Array.isArray(selectedFav.origin) || selectedFav.origin.length < 2 ||
        !Array.isArray(selectedFav.dest) || selectedFav.dest.length < 2) {
        if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "Cannot delete: invalid coordinate data.", true);
        return;
    }

    try {
        if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "Deleting favorite...", false, 0);
        const res = await fetch('/api/favorites', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: selectedFav.origin, dest: selectedFav.dest })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to delete favorite.`);

        await loadFavorites();
        if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, "Favorite deleted successfully!", false);
    } catch (error) {
        console.error('Error deleting favorite:', error);
        if (favoritesStatusMessage) showUserMessage(favoritesStatusMessage, error.message, true);
    }
}

// Favorites navigation
const viewFavoritesBtn = document.getElementById('viewFavoritesBtn');
const addFavoriteBtn = document.getElementById('addFavoriteBtn');
const viewFavoritesSection = document.getElementById('viewFavoritesSection');
const addFavoriteSection = document.getElementById('addFavoriteSection');

function switchFavoritesSection(section) {
    console.log('Switching favorites section to:', section);
    
    // Update buttons
    if (viewFavoritesBtn && addFavoriteBtn) {
        viewFavoritesBtn.classList.toggle('active', section === 'view');
        addFavoriteBtn.classList.toggle('active', section === 'add');
    }
    
    // Update sections
    if (viewFavoritesSection && addFavoriteSection) {
        viewFavoritesSection.classList.toggle('active', section === 'view');
        viewFavoritesSection.classList.toggle('hidden', section !== 'view');
        addFavoriteSection.classList.toggle('active', section === 'add');
        addFavoriteSection.classList.toggle('hidden', section !== 'add');
    }

    // If switching to add section, check if route is set
    if (section === 'add') {
        const currentPoints = window.mapManager?.getCurrentPoints?.();
        const hasValidRoute = currentPoints?.start && currentPoints?.dest;
        
        if (!hasValidRoute) {
            // Switch to route tab to set points
            const tabRouteButton = document.getElementById('tabRoute');
            if (tabRouteButton) {
                tabRouteButton.click();
                
                // Show message to user
                const routeInstruction = document.querySelector('.route-instruction');
                if (routeInstruction) {
                    routeInstruction.textContent = 'Set start and end points to add to favorites';
                }

                // Enable point setting mode
                if (window.mapManager) {
                    window.mapManager.isSettingPoints = true;
                    window.mapManager.updateSetPointsButtonState(true);
                }

                // Add one-time listener for route calculation completion
                const originalCalculateRoute = window.mapManager.calculateRoute;
                window.mapManager.calculateRoute = function() {
                    originalCalculateRoute.apply(this, arguments);
                    
                    // Switch back to favorites tab and add section after route is calculated
                    const tabFavoritesButton = document.getElementById('tabFavorites');
                    if (tabFavoritesButton) {
                        setTimeout(() => {
                            tabFavoritesButton.click();
                            const addFavBtn = document.getElementById('addFavoriteBtn');
                            if (addFavBtn) {
                                addFavBtn.click();
                            }
                        }, 500);
                    }
                    
                    // Restore original function
                    window.mapManager.calculateRoute = originalCalculateRoute;
                };
            }
        } else {
            // Show the add favorite section with current route info
            const favoritesStatusMessage = document.querySelector('#favoritesTabContent .status-message');
            if (favoritesStatusMessage) {
                favoritesStatusMessage.style.color = '#4b5563'; // Changed to gray
                favoritesStatusMessage.textContent = 'Name your route and click save to add it to favorites';
            }
            
            // Clear any existing values in the input fields
            const originInput = document.getElementById('favOriginNameSheet');
            const destInput = document.getElementById('favDestNameSheet');
            
            if (originInput) {
                originInput.value = '';
                originInput.focus();
            }
            
            if (destInput) {
                destInput.value = '';
            }
        }
    }
}

if (viewFavoritesBtn && addFavoriteBtn) {
    viewFavoritesBtn.addEventListener('click', () => switchFavoritesSection('view'));
    addFavoriteBtn.addEventListener('click', () => switchFavoritesSection('add'));
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded. Initializing app...");

    // --- לוגיקת אימות (Auth Modal) ---
    const authModalContainer = document.getElementById('authModalContainer');
    const openAuthModalBtn = document.getElementById('openAuthModalBtn');
    const authModalCloseBtn = document.getElementById('authModalCloseBtn');
    const loginFormInModal = document.getElementById('loginForm');
    const registerFormInModal = document.getElementById('registerForm');
    const loginTabButtonInModal = document.getElementById('loginTab');
    const registerTabButtonInModal = document.getElementById('registerTab');

    if (openAuthModalBtn) {
        openAuthModalBtn.addEventListener('click', () => {
            if (authModalContainer) {
                authModalContainer.style.display = 'block';
                showLogin();
            }
        });
    }
    if (authModalCloseBtn) {
        authModalCloseBtn.addEventListener('click', () => {
            if (authModalContainer) authModalContainer.style.display = 'none';
        });
    }
    window.addEventListener('click', (event) => {
        if (authModalContainer && event.target === authModalContainer) {
            authModalContainer.style.display = 'none';
        }
    });
    if (loginTabButtonInModal) loginTabButtonInModal.addEventListener('click', showLogin);
    if (registerTabButtonInModal) registerTabButtonInModal.addEventListener('click', showRegister);
    if (loginFormInModal) loginFormInModal.addEventListener('submit', loginUser);
    if (registerFormInModal) registerFormInModal.addEventListener('submit', registerUser);

    // --- לוגיקת הטאבים של ה-BottomSheet ---
    const bottomSheetNode = document.getElementById('bottomSheet');
    const bottomSheetTabsContainer = bottomSheetNode ? bottomSheetNode.querySelector('.bottom-sheet-tabs-container') : null;

    if (bottomSheetTabsContainer) {
        bottomSheetTabsContainer.addEventListener('click', (event) => {
            const button = event.target.closest('.tab-button');
            
            if (!button || button.classList.contains('hidden')) {
                return;
            }

            // בדיקת לחיצה על טאב פעיל - נחזיר רק אם זה לא טאב ההשוואה
            if (button.classList.contains('active') && button.id !== 'tabCompare') {
                return;
            }

            // אם זה טאב ההשוואה ונלחץ כשהוא פעיל, נחזור למסך ההתחלתי
            if (button.id === 'tabCompare' && button.classList.contains('active')) {
                const compareInitialView = document.getElementById('compareInitialView');
                const compareResultsView = document.getElementById('compareResultsView');
                if (compareInitialView && compareResultsView) {
                    compareInitialView.classList.add('active');
                    compareResultsView.classList.remove('active');
                }
                return;
            }

            // המשך הלוגיקה הקיימת של החלפת טאבים
            const allTabButtonsInContainer = bottomSheetTabsContainer.querySelectorAll('.tab-button');
            const tabContentsArea = bottomSheetNode.querySelector('.tab-content-area');
            const tabContents = tabContentsArea ? tabContentsArea.querySelectorAll(':scope > .tab-content') : [];

            allTabButtonsInContainer.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => {
                content.classList.remove('active');
                content.classList.add('hidden');
            });

            button.classList.add('active');
            let contentIdSuffix = button.id.substring(3);
            contentIdSuffix = contentIdSuffix.charAt(0).toLowerCase() + contentIdSuffix.slice(1);
            const targetContentId = contentIdSuffix + 'TabContent';

            const targetContent = document.getElementById(targetContentId);



            if (targetContent) {
                console.log("Target content to display:", targetContentId, "Current classes:", targetContent.classList.toString());
                targetContent.classList.remove('hidden');
                targetContent.classList.add('active');
                console.log("Target content classes AFTER update:", targetContent.classList.toString());
                if (targetContentId === 'favoritesTabContent' && sessionStorage.getItem('currentUser')) {
                    console.log("BottomSheet: Switched to Favorites tab, calling loadFavorites().");
                    loadFavorites();
                }
            } else {
                console.error("BottomSheet: ERROR - Target content element not found for ID:", targetContentId);
            }
            console.log("--- End Tab Click Event (Delegated) ---");
        });

        // הפעלה ראשונית של טאב ברירת המחדל עדיין תצטרך להתבצע בנפרד
        // אחרי שה-DOM טעון וה-listener של ה-delegation הוצמד.
        // אפשר לעשות זאת ב-setTimeout קטן כדי לוודא שה-listener של ה-delegation כבר קיים.
        setTimeout(() => {
            const defaultActiveButton = document.getElementById('tabRoute');
            if (defaultActiveButton && !defaultActiveButton.classList.contains('hidden')) {
                defaultActiveButton.click();
                console.log("BottomSheet: Initial default tab 'tabRoute' click triggered (after delegation setup).");
            } else if (defaultActiveButton && defaultActiveButton.classList.contains('hidden')) {
                 console.warn("BottomSheet: Default tab 'tabRoute' is hidden, cannot trigger click (after delegation setup).");
            } else {
                console.error("BottomSheet: Default tab 'tabRoute' not found for initial activation (after delegation setup).");
            }
        }, 0); // אפילו setTimeout עם 0 יעזור לדחות לסוף ה-event loop הנוכחי
    } else {
        console.warn("BottomSheet: Essential elements (.bottom-sheet-tabs-container or #bottomSheet) not found.");
    }


    // --- בדיקת משתמש מחובר בטעינת עמוד (אחרי הגדרת הטאבים) ---
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user && user.firstName) {
                loginSuccess(user.firstName);
            } else {
                sessionStorage.removeItem('currentUser');
                updateUserSpecificFeatures(false);
            }
        } catch (e) {
            console.error("Error parsing stored user data:", e);
            sessionStorage.removeItem('currentUser');
            updateUserSpecificFeatures(false);
        }
    } else {
        updateUserSpecificFeatures(false);
    }


    // --- מאזינים לפקדים נוספים (מועדפים, תלוי מפה וכו') ---
    const saveFavBtn = document.getElementById('saveFavBtnSheet');
    const favListSelect = document.getElementById('favListSheet');
    const calcFavBtnSheet = document.getElementById('calcFavBtnSheet');
    const deleteFavBtnSheet = document.getElementById('deleteFavBtnSheet');

    if (saveFavBtn) saveFavBtn.addEventListener('click', saveFavorite);
    if (favListSelect) {
        favListSelect.addEventListener('change', () => {
            const selectedIndex = parseInt(favListSelect.value, 10);
            if (Array.isArray(favorites) && selectedIndex >= 0 && selectedIndex < favorites.length) {
                selectedFav = favorites[selectedIndex];
            } else {
                selectedFav = null;
            }
            console.log("Favorite selected from list:", selectedFav);
            if (calcFavBtnSheet) calcFavBtnSheet.disabled = !selectedFav;
            if (deleteFavBtnSheet) deleteFavBtnSheet.disabled = !selectedFav;
        });
    }
    if (calcFavBtnSheet) calcFavBtnSheet.addEventListener('click', useFavorite);
    if (deleteFavBtnSheet) deleteFavBtnSheet.addEventListener('click', deleteFavorite);

    console.log("Attempting to set up map dependent listeners...");
    setupMapDependentListeners();
});


function setupMapDependentListeners() {
    if (window.mapManager) {
        console.log("mapManager found, setting up listeners for bottom sheet controls.");

        const setPointsBtnExpanded = document.getElementById('setPointsBtnExpanded');
        const compareBtnSheetButton = document.getElementById('compareRoutesBtnSheet');
        const shadeSlider = document.getElementById('shadeSliderSheet');
        const setPointsBtnSheet = document.getElementById('setPointsBtnSheet');
        const futureDateInput = document.getElementById('futureDate');
        const futureTimeInput = document.getElementById('futureTime');
        const applyFuturePlanBtn = document.getElementById('applyFuturePlanBtn');
        const resetToNowBtn = document.getElementById('resetToNowBtn');
        const planningStatusP = document.getElementById('planningStatus');
        const closeComparisonBtn = document.getElementById('closeComparisonBtn');

        if (closeComparisonBtn) {
            closeComparisonBtn.addEventListener('click', () => {
                const comparisonDisplaySection = document.getElementById('comparisonSectionSheet');
                if(comparisonDisplaySection) comparisonDisplaySection.classList.add('hidden');
                if (window.mapManager && typeof window.mapManager.clearComparisonDisplay === 'function') {
                    window.mapManager.clearComparisonDisplay();
                }
            });
        }

        if (setPointsBtnExpanded) {
            setPointsBtnExpanded.addEventListener('click', () => window.mapManager.togglePointSetting());
        }
        if (setPointsBtnSheet) {
            setPointsBtnSheet.addEventListener('click', () => {
                const bottomSheet = document.getElementById('bottomSheet');
                const handle = bottomSheet ? bottomSheet.querySelector('.sheet-handle') : null;
                if (bottomSheet && handle && !bottomSheet.classList.contains('expanded')) {
                     if (typeof toggleBottomSheet === 'function') {
                        toggleBottomSheet();
                     } else if (bottomSheet){
                        bottomSheet.classList.add('expanded');
                     }
                }
                const tabRouteButton = document.getElementById('tabRoute');
                if (tabRouteButton && !tabRouteButton.classList.contains('active')) {
                    tabRouteButton.click();
                }
                window.mapManager.togglePointSetting();
            });
        }
        if (compareBtnSheetButton) {
            compareBtnSheetButton.addEventListener('click', () => {
                const comparisonDisplaySection = document.getElementById('comparisonSectionSheet');
                if (window.mapManager && window.mapManager.startPointCoords && window.mapManager.endPointCoords) {
                    if (comparisonDisplaySection) comparisonDisplaySection.classList.remove('hidden');
                    window.mapManager.startRouteComparison();
                } else {
                    alert("Please set start and destination points before comparing routes.");
                    const tabRouteButton = document.getElementById('tabRoute');
                    if (tabRouteButton) tabRouteButton.click();
                }
            });
        }
        if (shadeSlider) {
            shadeSlider.addEventListener('input', (e) => {
                const display = document.getElementById('shadeValueDisplaySheet');
                if (display) display.textContent = parseFloat(e.target.value).toFixed(1);
                if (window.mapManager) window.mapManager.setShadeWeight(e.target.value);
            });
        }

        const comparisonStatsDisplay = document.getElementById('comparisonStatsDisplay');
        if (comparisonStatsDisplay) {
            comparisonStatsDisplay.addEventListener('click', (event) => {
                if (event.target.id === 'nextCompRouteBtn') window.mapManager.showNextComparisonRoute();
                else if (event.target.id === 'prevCompRouteBtn') window.mapManager.showPreviousComparisonRoute();
            });
        }

        if (applyFuturePlanBtn && futureDateInput && futureTimeInput && planningStatusP && resetToNowBtn) {
            applyFuturePlanBtn.addEventListener('click', () => {
                const dateValue = futureDateInput.value;
                const timeValue = futureTimeInput.value;
                if (!dateValue || !timeValue) {
                    alert('Please select a valid date and time.'); return;
                }
                const dateTimeString = `${dateValue}T${timeValue}:00`;
                if (window.mapManager && typeof window.mapManager.loadShadowsForFutureTime === 'function') {
                    planningStatusP.textContent = 'Loading future shadows...';
                    window.mapManager.loadShadowsForFutureTime(dateTimeString)
                        .then(response => {
                            if (planningStatusP) {
                                if (response && response.message) {
                                     planningStatusP.textContent = response.message;
                                } else if (response && response.requested_time) {
                                    try {
                                        const displayDate = new Date(response.requested_time).toLocaleString('en-GB', {
                                            year: 'numeric', month: '2-digit', day: '2-digit',
                                            hour: '2-digit', minute: '2-digit'
                                        });
                                        planningStatusP.textContent = `Displaying shadows for: ${displayDate}`;
                                    } catch (e) { planningStatusP.textContent = `Shadows displayed for the requested time.`; }
                                } else {
                                    planningStatusP.textContent = `Shadows updated.`;
                                }
                                resetToNowBtn.style.display = 'inline-block';
                            }
                        })
                        .catch(error => {
                            if (planningStatusP) planningStatusP.textContent = 'Error loading future shadows.';
                            console.error("Error loading future shadows from app.js:", error);
                        });
                }
            });

            resetToNowBtn.addEventListener('click', () => {
                if (window.mapManager && typeof window.mapManager.resetShadowsToCurrentTime === 'function') {
                    planningStatusP.textContent = 'Resetting to current time...';
                    window.mapManager.resetShadowsToCurrentTime()
                        .then(response => {
                            if (planningStatusP) {
                                if (response && response.message) {
                                    planningStatusP.textContent = response.message;
                                } else {
                                    planningStatusP.textContent = 'Displaying shadows for current time.';
                                }
                            }
                            resetToNowBtn.style.display = 'none';
                            futureDateInput.value = '';
                            futureTimeInput.value = '';
                        })
                        .catch(error => {
                            if (planningStatusP) planningStatusP.textContent = 'Error resetting to current time.';
                            console.error("Error resetting shadows from app.js:", error);
                        });
                }
            });
        } else {
            console.warn("Some future planning UI elements are missing.");
        }
    } else {
        console.warn("mapManager is not available yet! Retrying listener setup in 100ms...");
        setTimeout(setupMapDependentListeners, 100);
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}



