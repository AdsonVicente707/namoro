document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const profilePicInput = document.getElementById('profilePic');
    const inviteCodeInput = document.getElementById('inviteCode');
    const profilePicPreview = document.getElementById('profilePicPreview');

    // Adiciona o evento para pré-visualizar a imagem
    profilePicInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                profilePicPreview.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const profilePicFile = profilePicInput.files[0];
        const inviteCode = inviteCodeInput.value.trim();

        if (!username || !password || !profilePicFile) {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);
        formData.append('profilePic', profilePicFile);
        if (inviteCode) {
            formData.append('inviteCode', inviteCode);
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                body: formData, // Não precisa de 'Content-Type' header, o browser define
            });
            const result = await response.json();
            alert(result.message);
            if (response.ok) {
                window.location.href = 'login.html';
            }
        } catch (error) {
            alert('Ocorreu um erro ao tentar se registrar.');
        }
    });
});