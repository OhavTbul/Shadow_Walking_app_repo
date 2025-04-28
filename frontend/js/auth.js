const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const messageDiv = document.getElementById('message');

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const first_name = document.getElementById('regFirstName').value;
    const last_name = document.getElementById('regLastName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    const response = await fetch('http://127.0.0.1:8001/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({first_name, last_name, email, password})
    });

    const result = await response.json();

    if (response.ok) {
        messageDiv.innerText = 'Registration successful!';
        registerForm.reset();
    } else {
        messageDiv.innerText = `Registration failed: ${result.error}`;
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const response = await fetch('http://127.0.0.1:8001/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, password})
    });

    const result = await response.json();

    if (response.ok) {
        messageDiv.innerText = `Login successful! Welcome ${result.first_name}.`;
        loginForm.reset();
    } else {
        messageDiv.innerText = `Login failed: ${result.error}`;
    }
});
