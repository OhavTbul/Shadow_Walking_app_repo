// js/bottomSheet.js

document.addEventListener('DOMContentLoaded', () => {
    // מצא את אלמנט הפאנל ואת הידית שלו
    const bottomSheet = document.getElementById('bottomSheet');
    const handle = bottomSheet.querySelector('.sheet-handle');

    // ודא שהאלמנטים קיימים לפני שמוסיפים מאזינים
    if (bottomSheet && handle) {
        // הוסף מאזין ללחיצה על הידית
        handle.addEventListener('click', () => {
            // החלף את המחלקה 'expanded' על הפאנל
            // זה יגרום ל-CSS להזיז את הפאנל למעלה/למטה (בעזרת ה-transform)
            // ולהציג/להסתיר את התוכן המתאים
            bottomSheet.classList.toggle('expanded');

            // אופציונלי: הדפסה לקונסול לבדיקה
            if (bottomSheet.classList.contains('expanded')) {
                console.log('Bottom sheet expanded');
            } else {
                console.log('Bottom sheet collapsed');
            }
        });

        // --- כאן תוכל להוסיף בעתיד לוגיקה מורכבת יותר ---
        // למשל, זיהוי החלקה (swipe) על הידית או על הפאנל כולו
        // או סגירת הפאנל בלחיצה מחוצה לו (על המפה).
    } else {
        console.error('Could not find bottom sheet elements (#bottomSheet or .sheet-handle)');
    }
});