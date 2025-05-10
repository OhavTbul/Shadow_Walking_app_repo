// ========================================
//          app.js
// ========================================

// --- הגדרות משתנים גלובליים ופונקציות עזר ---

// משתנים גלובליים לקובץ זה (נוגעים לאימות ומועדפים)
let favorites = [];
let selectedFav = null;

// פונקציות עזר להצגת טאבים וטפסים של אימות
function showLogin() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const messageDiv = document.getElementById('message');

  if (loginForm) loginForm.style.display = 'block';
  if (registerForm) registerForm.style.display = 'none';
  if (loginTab) loginTab.classList.add('active');
  if (registerTab) registerTab.classList.remove('active');
  if (messageDiv) messageDiv.innerText = '';
}

function showRegister() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const messageDiv = document.getElementById('message');

  if (loginForm) loginForm.style.display = 'none';
  if (registerForm) registerForm.style.display = 'block';
  if (loginTab) loginTab.classList.remove('active');
  if (registerTab) registerTab.classList.add('active');
  if (messageDiv) messageDiv.innerText = '';
}

// פונקצית עזר להצגת הודעות למשתמש
function showMessage(msg, isError) {
  const messageDiv = document.getElementById('message');
  if (messageDiv) {
    messageDiv.style.color = isError ? 'var(--danger-color)' : 'green'; // Use CSS variable
    messageDiv.innerText = msg;
  }
}

// פונקציה לעדכון נראות/זמינות פיצ'רים תלויי משתמש רשום
function updateUserSpecificFeatures(isLoggedIn) {
    const favoritesSection = document.getElementById('favoritesSectionSheet');
    const compareBtn = document.getElementById('compareRoutesBtnSheet');
    const futurePlanningSection = document.getElementById('futurePlanningSection');

    // אלמנטים נוספים שקשורים למועדפים וצריך להסתיר/להציג
    const favOriginNameSheet = document.getElementById('favOriginNameSheet');
    const favDestNameSheet = document.getElementById('favDestNameSheet');
    const saveFavBtnSheet = document.getElementById('saveFavBtnSheet');
    const favList = document.getElementById('favListSheet');
    const calcFavBtn = document.getElementById('calcFavBtnSheet');
    const deleteFavBtn = document.getElementById('deleteFavBtnSheet');

    if (isLoggedIn) {
        if (favoritesSection) favoritesSection.classList.remove('hidden');
        if(favOriginNameSheet) favOriginNameSheet.style.display = 'inline-block';
        if(favDestNameSheet) favDestNameSheet.style.display = 'inline-block';
        if(saveFavBtnSheet) saveFavBtnSheet.style.display = 'inline-block';
        // הנראות של favList, calcFavBtn, deleteFavBtn תטופל על ידי loadFavorites

        if (compareBtn) {
            compareBtn.classList.remove('hidden');
            compareBtn.disabled = false;
        }
        if (futurePlanningSection) futurePlanningSection.classList.remove('hidden');

    } else { // משתמש לא מחובר
        if (favoritesSection) favoritesSection.classList.add('hidden');
        if(favOriginNameSheet) favOriginNameSheet.style.display = 'none';
        if(favDestNameSheet) favDestNameSheet.style.display = 'none';
        if(saveFavBtnSheet) saveFavBtnSheet.style.display = 'none';
        if (favList) {
            favList.innerHTML = '';
            favList.style.display = 'none';
        }
        if (calcFavBtn) {
            calcFavBtn.disabled = true;
            calcFavBtn.style.display = 'none';
        }
        if (deleteFavBtn) {
            deleteFavBtn.disabled = true;
            deleteFavBtn.style.display = 'none';
        }

        if (compareBtn) {
            compareBtn.classList.add('hidden');
        }
        if (futurePlanningSection) futurePlanningSection.classList.add('hidden');
    }
}


// פונקציה שרצה אחרי התחברות/הרשמה מוצלחת
function loginSuccess(name) {
  const authContainer = document.getElementById('authContainer');
  const topBar = document.getElementById('topBar');

  if(authContainer) authContainer.classList.add('hidden');
  if(topBar) {
    topBar.classList.remove('hidden');
    topBar.innerHTML = `Hello, <span style="color:var(--primary-color)">${name}</span>! <button id="logoutBtn" class="sheet-button danger-btn">Logout</button>`;
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
  }
  updateUserSpecificFeatures(true);
  loadFavorites();
}

// פונקצית התנתקות
function logout() {
  sessionStorage.removeItem('currentUser');
  location.reload();
}


// --- פונקציות אסינכרוניות לתקשורת עם השרת (אימות ומועדפים) ---
// (הפונקציות registerUser, loginUser, loadFavorites, saveFavorite, useFavorite, deleteFavorite - כפי שהיו בקוד הקודם שלך)
async function registerUser(event) {
  event.preventDefault();
  const regFirstName = document.getElementById('regFirstName');
  const regLastName = document.getElementById('regLastName');
  const regEmail = document.getElementById('regEmail');
  const regPassword = document.getElementById('regPassword');

  if (!regFirstName || !regLastName || !regEmail || !regPassword) {
      showMessage('Registration form elements not found.', true);
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
      if (!res.ok) {
          throw new Error(data.error || 'Registration failed');
      }
      sessionStorage.setItem('currentUser', JSON.stringify({firstName: data.first_name, id: data.id})); // שמירת ID חשובה למועדפים
      loginSuccess(data.first_name);
      document.getElementById('registerForm')?.reset();
  } catch (error) {
      console.error("Registration error:", error);
      showMessage(error.message, true);
  }
}

async function loginUser(event) {
  event.preventDefault();
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');

  if (!loginEmail || !loginPassword) {
       showMessage('Login form elements not found.', true);
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
       if (!res.ok) {
           throw new Error(data.error || 'Login failed');
       }
      sessionStorage.setItem('currentUser', JSON.stringify({firstName: data.first_name, id: data.id})); // שמירת ID
      loginSuccess(data.first_name);
      document.getElementById('loginForm')?.reset();
  } catch(error) {
       console.error("Login error:", error);
       showMessage(error.message, true);
  }
}

async function loadFavorites() {
  const favList = document.getElementById('favListSheet');
  const calcFavBtn = document.getElementById('calcFavBtnSheet');
  const deleteFavBtn = document.getElementById('deleteFavBtnSheet');

  if (!favList || !calcFavBtn || !deleteFavBtn) {
      console.warn("Favorite list/buttons UI elements not found.");
      // No need to hide favOriginNameSheet etc. here, updateUserSpecificFeatures handles general visibility
  }

  try {
    const res = await fetch('/api/favorites');
    if (!res.ok) {
        if (res.status === 401) {
             console.log("User not logged in (from /api/favorites). Cannot load favorites.");
             // updateUserSpecificFeatures(false) is called on page load if not logged in.
             // This ensures the section is hidden.
             return;
        }
        throw new Error(`Failed to load favorites: ${res.statusText}`);
    }

    favorites = await res.json();
    if(favList) favList.innerHTML = '';

    if (!Array.isArray(favorites) || favorites.length === 0) {
      console.log("No favorites found for logged-in user.");
      if(favList) favList.style.display = 'none';
      if(calcFavBtn) calcFavBtn.style.display = 'none';
      if(deleteFavBtn) deleteFavBtn.style.display = 'none';
      if(calcFavBtn) calcFavBtn.disabled = true;
      if(deleteFavBtn) deleteFavBtn.disabled = true;
      selectedFav = null;
      return;
    }

    console.log("Favorites loaded:", favorites);
    if(favList) favList.style.display = 'inline-block';
    if(calcFavBtn) calcFavBtn.style.display = 'inline-block';
    if(deleteFavBtn) deleteFavBtn.style.display = 'inline-block';

    favorites.forEach((f, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const originCoordsText = Array.isArray(f.origin) && f.origin.length === 2 ? `[${f.origin[0].toFixed(4)}, ${f.origin[1].toFixed(4)}]` : 'N/A';
      const destCoordsText = Array.isArray(f.dest) && f.dest.length === 2 ? `[${f.dest[0].toFixed(4)}, ${f.dest[1].toFixed(4)}]` : 'N/A';
      opt.text = (f.origin_name && f.dest_name)
                 ? `${f.origin_name} ↔ ${f.dest_name}`
                 : `${originCoordsText} → ${destCoordsText}`;
      if(favList) favList.appendChild(opt);
    });

    if(favList) favList.selectedIndex = 0;
    selectedFav = favorites.length > 0 ? favorites[0] : null;
    if(calcFavBtn) calcFavBtn.disabled = !selectedFav;
    if(deleteFavBtn) deleteFavBtn.disabled = !selectedFav;

  } catch (err) {
    console.error('Failed loading favorites:', err);
    if(favList) favList.style.display = 'none';
    if(calcFavBtn) calcFavBtn.style.display = 'none';
    if(deleteFavBtn) deleteFavBtn.style.display = 'none';
  }
}

async function saveFavorite() {
    const favOriginEl = document.getElementById('favOriginNameSheet');
    const favDestEl = document.getElementById('favDestNameSheet');

     if (!favOriginEl || !favDestEl) {
         console.error("Favorite name input elements not found.");
         return;
     }
    if (!window.mapManager || !window.mapManager.getCurrentPoints) {
        alert("Error: Map manager is not ready yet."); return;
    }
    const { start, dest } = window.mapManager.getCurrentPoints();
    if (!start || !dest) {
        alert("Please set both start and destination points before saving a favorite."); return;
    }
    try {
        const body = {
            origin: [start.lat, start.lng], dest: [dest.lat, dest.lng],
            origin_name: favOriginEl.value.trim() || null,
            dest_name: favDestEl.value.trim() || null
        };
        const res = await fetch('/api/favorites', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Failed to save favorite.'}));
            throw new Error(errorData.error || `Failed to save favorite: ${res.statusText}`);
        }
        favOriginEl.value = ''; favDestEl.value = '';
        await loadFavorites();
        alert("Favorite saved successfully!");
    } catch (error) {
        console.error("Error saving favorite:", error);
        showMessage(error.message, true);
    }
}

function useFavorite() {
     const calcFavBtn = document.getElementById('calcFavBtnSheet');
     if (!selectedFav || !window.mapManager || !calcFavBtn || calcFavBtn.disabled) return;
     if (!Array.isArray(selectedFav.origin) || selectedFav.origin.length < 2 ||
         !Array.isArray(selectedFav.dest) || selectedFav.dest.length < 2) {
         alert("Selected favorite has invalid coordinate data."); return;
     }
    const startLatLng = { lng: selectedFav.origin[1], lat: selectedFav.origin[0] };
    const destLatLng = { lng: selectedFav.dest[1], lat: selectedFav.dest[0] };
    window.mapManager.setStartPoint(startLatLng);
    window.mapManager.setEndPoint(destLatLng);
    window.mapManager.calculateRoute();
    document.getElementById('bottomSheet')?.classList.remove('expanded');
}

async function deleteFavorite() {
    const deleteFavBtn = document.getElementById('deleteFavBtnSheet');
    if (!selectedFav || !deleteFavBtn || deleteFavBtn.disabled) return;
    if (!confirm(`Are you sure you want to delete this favorite?`)) return;
     if (!Array.isArray(selectedFav.origin) || selectedFav.origin.length < 2 ||
         !Array.isArray(selectedFav.dest) || selectedFav.dest.length < 2) {
         alert("Cannot delete favorite: invalid coordinate data."); return;
     }
    try {
        const res = await fetch('/api/favorites', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: selectedFav.origin, dest: selectedFav.dest })
        });
        if (!res.ok) {
             const errorData = await res.json().catch(() => ({ error: 'Failed to delete favorite.'}));
             throw new Error(errorData.error || `Failed to delete favorite: ${res.statusText}`);
        }
        await loadFavorites();
        alert("Favorite deleted successfully!");
    } catch (error) {
        console.error('Error deleting favorite:', error);
        showMessage(error.message, true);
    }
}


// --- מאזין אירועים ראשי שרץ אחרי טעינת ה-DOM ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded and parsed");

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const saveFavBtn = document.getElementById('saveFavBtnSheet');
  const favList = document.getElementById('favListSheet');
  const calcFavBtn = document.getElementById('calcFavBtnSheet');
  const deleteFavBtn = document.getElementById('deleteFavBtnSheet');

  if (loginTab) loginTab.addEventListener('click', showLogin);
  if (registerTab) registerTab.addEventListener('click', showRegister);
  if (loginForm) loginForm.addEventListener('submit', loginUser);
  if (registerForm) registerForm.addEventListener('submit', registerUser);
  if (saveFavBtn) saveFavBtn.addEventListener('click', saveFavorite);
  if (favList) {
      favList.addEventListener('change', () => {
          selectedFav = favorites[favList.value] || null;
          if (calcFavBtn) calcFavBtn.disabled = !selectedFav;
          if (deleteFavBtn) deleteFavBtn.disabled = !selectedFav;
      });
  }
  if (calcFavBtn) calcFavBtn.addEventListener('click', useFavorite);
  if (deleteFavBtn) deleteFavBtn.addEventListener('click', deleteFavorite);

  setupMapDependentListeners();

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
           console.error("Error parsing stored user data", e);
           sessionStorage.removeItem('currentUser');
           updateUserSpecificFeatures(false);
       }
   } else {
       updateUserSpecificFeatures(false);
   }
});


// --- פונקציה להגדרת מאזינים שתלויים בטעינת mapManager ---
function setupMapDependentListeners() {
    if (window.mapManager) {
        console.log("mapManager found, setting up listeners for bottom sheet controls.");

        const setPointsBtnExpanded = document.getElementById('setPointsBtnExpanded');
        const compareBtnSheet = document.getElementById('compareRoutesBtnSheet');
        const shadeSlider = document.getElementById('shadeSliderSheet');
        const setPointsBtnSheet = document.getElementById('setPointsBtnSheet');

        // פקדים חדשים לתכנון עתידי
        const futureDateInput = document.getElementById('futureDate');
        const futureTimeInput = document.getElementById('futureTime');
        const applyFuturePlanBtn = document.getElementById('applyFuturePlanBtn');
        const resetToNowBtn = document.getElementById('resetToNowBtn');
        const planningStatusP = document.getElementById('planningStatus');

        const closeComparisonBtn = document.getElementById('closeComparisonBtn');
        const comparisonSection = document.getElementById('comparisonSectionSheet');

        if (closeComparisonBtn && comparisonSection) {
            console.log("Adding click listener to closeComparisonBtn"); // לבדיקה
            closeComparisonBtn.addEventListener('click', () => {
                console.log("closeComparisonBtn clicked!"); // לבדיקה
                comparisonSection.classList.add('hidden'); // הסתר את הפאנל

                if (window.mapManager && typeof window.mapManager.clearComparisonAndMainRouteIfNeeded === 'function') {
                    console.log("Calling mapManager.clearComparisonAndMainRouteIfNeeded"); // לבדיקה
                    window.mapManager.clearComparisonAndMainRouteIfNeeded();
                } else {
                    console.error("mapManager.clearComparisonAndMainRouteIfNeeded is not available or not a function.");
                }
            });
        } else {
            if (!closeComparisonBtn) console.warn("Element with ID 'closeComparisonBtn' not found in setupMapDependentListeners for adding listener.");
            if (!comparisonSection) console.warn("Element with ID 'comparisonSectionSheet' not found for close button listener.");
        }


        if (setPointsBtnExpanded) {
            setPointsBtnExpanded.addEventListener('click', () => {
                window.mapManager.togglePointSetting();
            });
        }
        if (setPointsBtnSheet) {
            setPointsBtnSheet.addEventListener('click', () => {
                const bottomSheet = document.getElementById('bottomSheet');
                if (bottomSheet && !bottomSheet.classList.contains('expanded')) {
                    bottomSheet.classList.add('expanded');
                }
                window.mapManager.togglePointSetting();
            });
        }
        if (compareBtnSheet) {
            compareBtnSheet.addEventListener('click', () => {
                const comparisonSection = document.getElementById('comparisonSectionSheet');
                if (comparisonSection) comparisonSection.classList.remove('hidden');
                window.mapManager.startRouteComparison();
            });
        }
        if (shadeSlider) {
            shadeSlider.addEventListener('input', (e) => {
                const display = document.getElementById('shadeValueDisplaySheet');
                if (display) display.textContent = parseFloat(e.target.value).toFixed(1);
                window.mapManager.setShadeWeight(e.target.value);
            });
        }

        // Event Delegation for comparison navigation buttons
        const comparisonStatsDisplay = document.getElementById('comparisonStatsDisplay');
        if (comparisonStatsDisplay) {
            comparisonStatsDisplay.addEventListener('click', (event) => {
                if (event.target.id === 'nextCompRouteBtn') {
                    window.mapManager.showNextComparisonRoute();
                } else if (event.target.id === 'prevCompRouteBtn') {
                    window.mapManager.showPreviousComparisonRoute();
                }
            });
        } else {
            console.warn("Element with ID 'comparisonStatsDisplay' not found for event delegation.");
        }

        // מאזינים לפקדי תכנון עתידי
        if (applyFuturePlanBtn && futureDateInput && futureTimeInput && planningStatusP && resetToNowBtn) {
            applyFuturePlanBtn.addEventListener('click', () => {
                const dateValue = futureDateInput.value; // YYYY-MM-DD
                const timeValue = futureTimeInput.value; // HH:MM

                if (!dateValue || !timeValue) {
                    alert('אנא בחר תאריך ושעה תקינים.');
                    return;
                }
                const dateTimeString = `${dateValue}T${timeValue}:00`;

                if (window.mapManager && typeof window.mapManager.loadShadowsForFutureTime === 'function') {
                    window.mapManager.loadShadowsForFutureTime(dateTimeString)
                        .then(requestedTimeISO => {
                            if (planningStatusP && requestedTimeISO) {
                                try {
                                    const displayDate = new Date(requestedTimeISO).toLocaleString('he-IL', {
                                        year: 'numeric', month: '2-digit', day: '2-digit',
                                        hour: '2-digit', minute: '2-digit'
                                    });
                                    planningStatusP.textContent = `מציג צללים עבור: ${displayDate}`;
                                } catch (e) {
                                    planningStatusP.textContent = `הוצגו צללים לזמן המבוקש.`;
                                }
                                resetToNowBtn.style.display = 'inline-block';
                            } else if (planningStatusP) {
                                // מקרה שאין requestedTimeISO (למשל אם השרת החזיר הודעת 'אין צללים')
                                planningStatusP.textContent = `אין צללים להצגה בזמן המבוקש.`;
                                resetToNowBtn.style.display = 'inline-block'; // עדיין אפשר לאפס
                            }
                        })
                        .catch(error => {
                            if (planningStatusP) planningStatusP.textContent = 'שגיאה בטעינת צללים עתידיים.';
                            console.error("Error loading future shadows from app.js:", error);
                        });
                }
            });

            resetToNowBtn.addEventListener('click', () => {
                if (window.mapManager && typeof window.mapManager.resetShadowsToCurrentTime === 'function') {
                    window.mapManager.resetShadowsToCurrentTime()
                        .then(() => {
                            if (planningStatusP) planningStatusP.textContent = 'מציג צללים לזמן נוכחי.';
                            resetToNowBtn.style.display = 'none';
                            futureDateInput.value = '';
                            futureTimeInput.value = '';
                        })
                        .catch(error => {
                            if (planningStatusP) planningStatusP.textContent = 'שגיאה באיפוס לזמן נוכחי.';
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