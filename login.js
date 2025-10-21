document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Se o usuário já estiver logado, redireciona para o chat
    const username = localStorage.getItem('bellaTrixUsername');
    const coupleId = localStorage.getItem('bellaTrixCoupleId');

    if (username && coupleId) { // Verifica se AMBOS os itens existem
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
                localStorage.setItem('bellaTrixCoupleId', result.coupleId); // Salva o ID do casal
                localStorage.setItem('bellaTrixProfilePic', result.profile_pic); // Salva a foto de perfil
                window.location.href = 'index.html';
            } else {
                alert(result.message);
            }
        } catch (error) {
            alert('Erro ao tentar fazer login.');
        }
    });
});