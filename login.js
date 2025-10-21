document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Se o usuário já estiver logado, redireciona para o chat
    if (localStorage.getItem('bellaTrixUsername')) {
        window.location.href = 'index.html';
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Impede o envio padrão do formulário
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();

            if (response.ok) {
                localStorage.setItem('bellaTrixUsername', result.username);
                localStorage.setItem('bellaTrixProfilePic', result.profile_pic);
                window.location.href = 'index.html';
            } else {
                alert(result.message);
            }
        } catch (error) {
            alert('Erro ao tentar fazer login.');
        }
    });
});