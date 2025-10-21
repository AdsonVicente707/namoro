document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Inicia a conexão com o servidor Socket.IO
    const countButton = document.getElementById('countButton');
    const welcomeTitle = document.getElementById('welcomeTitle');
    const counterDisplay = document.getElementById('counter');
    const romanticText = document.getElementById('romanticText'); // Pega o novo elemento de texto
    const image = document.querySelector('.imagem'); // Pega o elemento da imagem
    const backgroundMusic = document.getElementById('backgroundMusic'); // Pega o elemento de áudio
    let count = 0;
    // Elementos do Chat
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const typingIndicator = document.getElementById('typing-indicator');
    const emojiButton = document.getElementById('emojiButton');
    const logoutButton = document.getElementById('logoutButton');
    // Elementos do Mural de Fotos
    const photoUploadForm = document.getElementById('photoUploadForm');
    const photoInput = document.getElementById('photoInput');
    const captionInput = document.getElementById('captionInput');
    const photoGallery = document.getElementById('photoGallery');

    // Pega o nome do usuário do localStorage
    const username = localStorage.getItem('bellaTrixUsername');
    const coupleId = localStorage.getItem('bellaTrixCoupleId');

    // Se não houver usuário, volta para a página de login
    if (!username || !coupleId) {
        window.location.href = 'login.html';
        return; // Para a execução do script
    }

    // Entra na sala do casal no servidor
    socket.emit('join couple room', coupleId);

    // Adiciona o evento de clique para o botão de logout
    logoutButton.addEventListener('click', () => {
        // Limpa os dados do usuário do armazenamento local
        localStorage.removeItem('bellaTrixUsername');
        localStorage.removeItem('bellaTrixCoupleId');
        localStorage.removeItem('bellaTrixProfilePic');
        window.location.href = 'login.html'; // Redireciona para a página de login
    });

    let intervalId;
    let heartIntervalId;

    function createHeart() {
        const heart = document.createElement('div');
        heart.classList.add('heart');
        heart.innerHTML = '❤️';

        // Posição horizontal aleatória
        heart.style.left = Math.random() * 100 + 'vw';

        // Duração da animação aleatória para um efeito mais natural
        const animationDuration = Math.random() * 5 + 5; // entre 5 e 10 segundos
        heart.style.animationDuration = animationDuration + 's';

        document.body.appendChild(heart);

        // Remove o coração do DOM depois que a animação termina
        setTimeout(() => {
            heart.remove();
        }, animationDuration * 1000);
    }

    // Personaliza o título de boas-vindas
    welcomeTitle.textContent = `Bem-vinda, ${username}!`;

    countButton.addEventListener('click', () => {
        // Impede que múltiplos contadores iniciem
        if (intervalId) {
            return;
        }
        
        backgroundMusic.play(); // Inicia a música

        image.classList.add('glowing'); // Adiciona a classe de brilho na imagem

        romanticText.textContent = "O tempo que ficaremos juntos...";
        // Inicia a contagem, atualizando a cada milissegundo
        intervalId = setInterval(() => {
            counterDisplay.textContent = `${count++} de uma eternidade`;
        }, 1); // A contagem será muito rápida!

        // Inicia a criação de corações
        heartIntervalId = setInterval(createHeart, 300);
    });

    // A função agora aceita o remetente e o texto da mensagem
    function addMessageToChat(sender, messageText, profilePicUrl, timestamp) {
        // Cria o contêiner principal da mensagem
        const messageContainer = document.createElement('div');
        messageContainer.classList.add('message-container');

        // Cria o elemento da foto de perfil
        const profilePicElement = document.createElement('img');
        profilePicElement.classList.add('profile-pic');
        profilePicElement.src = profilePicUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👤</text></svg>';

        // Cria os elementos para o nome do remetente e o texto
        const senderElement = document.createElement('span'); // Mudado para span para mais flexibilidade
        senderElement.textContent = sender;
        senderElement.classList.add('sender-name'); // Adiciona uma classe para estilização

        // Cria o elemento para o timestamp
        const timestampElement = document.createElement('span');
        timestampElement.classList.add('message-timestamp');
        timestampElement.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); // Formata a hora

        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.textContent = messageText;

        // Adiciona o nome e o timestamp ao contentContainer
        // Adiciona uma classe para alinhar a mensagem (direita para o usuário atual)
        if (sender === username) {
            messageContainer.classList.add('my-message');
        }

        // Cria um contêiner para o nome, mensagem e timestamp
        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('message-content-wrapper'); // Novo wrapper para o conteúdo
        contentWrapper.append(senderElement, messageElement, timestampElement);

        // Adiciona a foto e o conteúdo ao container principal
        // A ordem muda dependendo de quem enviou a mensagem
        if (sender === username) {
            // Para mensagens do próprio usuário, o conteúdo fica à esquerda e a foto à direita
            messageContainer.append(contentWrapper, profilePicElement);
        } else {
            // Para mensagens recebidas, a foto fica à esquerda e o conteúdo à direita
            messageContainer.append(profilePicElement, contentWrapper); // Correção aqui
        }
        
        // Adiciona a mensagem à caixa de chat
        chatMessages.appendChild(messageContainer);

        // Rola para a mensagem mais recente
        chatMessages.scrollTop = chatMessages.scrollHeight; // Movido para o final da função
    }

    function sendMessage() {
        const messageText = chatInput.value.trim();
        if (messageText === "") {
            return; // Não envia mensagens vazias
        }

        // Cria um objeto de mensagem para enviar ao servidor
        const message = {
            coupleId: coupleId,
            sender: username,
            text: messageText,
            created_at: new Date().toISOString() // Adiciona o timestamp atual
        };

        // Envia a mensagem para o servidor
        socket.emit('chat message', message);

        // Informa que parou de digitar ao enviar a mensagem
        socket.emit('stop typing');

        chatInput.value = ""; // Limpa o input
    }

    // Ouve por mensagens vindas do servidor
    socket.on('chat message', (msg) => { // msg agora contém username, message_text, profile_pic, created_at
        // Usar msg.username e msg.message_text para consistência com o histórico
        addMessageToChat(msg.username, msg.message_text, msg.profile_pic, msg.created_at);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Rola para a mensagem mais recente
    });

    // Ouve pelo histórico de mensagens ao se conectar
    socket.on('chat history', (messages) => {
        messages.forEach(msg => {
            addMessageToChat(msg.username, msg.message_text, msg.profile_pic, msg.created_at);
        });
    });

    // --- Lógica de "usuário digitando" ---
    let typingTimer; // Timer para detectar quando o usuário para de digitar
    const doneTypingInterval = 1500; // Tempo em ms (1.5 segundos)

    chatInput.addEventListener('input', () => {
        // Quando o usuário digita, limpa o timer anterior e avisa que está digitando
        clearTimeout(typingTimer);
        socket.emit('typing', { coupleId: coupleId, sender: username });

        // Inicia um novo timer. Se ele terminar, significa que o usuário parou.
        typingTimer = setTimeout(() => {
            socket.emit('stop typing', { coupleId: coupleId });
        }, doneTypingInterval);
    });

    // Ouve o evento de que alguém está digitando
    socket.on('user typing', (data) => {
        typingIndicator.textContent = `${data.sender} está digitando...`;
    });

    // Ouve o evento de que alguém parou de digitar
    socket.on('user stop typing', () => {
        typingIndicator.textContent = '';
    });
    // --- Fim da lógica de "usuário digitando" ---

    // --- Lógica do Seletor de Emojis ---
    const emojiPicker = document.querySelector('emoji-picker');
    emojiPicker.style.display = 'none'; // Esconde o seletor inicialmente

    emojiButton.addEventListener('click', () => {
        // Alterna a visibilidade do seletor de emojis
        const isVisible = emojiPicker.style.display === 'block';
        emojiPicker.style.display = isVisible ? 'none' : 'block';
    });

    // Adiciona o emoji selecionado ao campo de texto
    emojiPicker.addEventListener('emoji-click', event => {
        chatInput.value += event.detail.unicode;
        emojiPicker.style.display = 'none'; // Esconde o seletor após a escolha
        chatInput.focus(); // Devolve o foco para o input
    });

    // --- Fim da lógica do Seletor de Emojis ---

    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (event) => {
        // Permite enviar com a tecla "Enter"
        if (event.key === 'Enter') {
            sendMessage();
        }
    });

    // --- Lógica do Mural de Fotos ---

    // Função para carregar e exibir as fotos
    async function loadPhotos() {
        try {
            const response = await fetch(`/api/photos/${coupleId}`);
            const photos = await response.json();

            photoGallery.innerHTML = ''; // Limpa a galeria antes de adicionar as fotos

            photos.forEach(photo => {
                const photoCard = document.createElement('div');
                photoCard.classList.add('photo-card');

                const img = document.createElement('img');
                img.src = photo.image_path;

                const caption = document.createElement('p');
                caption.classList.add('caption');
                caption.textContent = photo.caption;

                const shareButton = document.createElement('button');
                shareButton.classList.add('share-button');
                shareButton.textContent = 'Compartilhar';
                shareButton.onclick = () => sharePhoto(photo);

                photoCard.append(img, caption, shareButton);
                photoGallery.appendChild(photoCard);
            });
        } catch (error) {
            console.error('Erro ao carregar fotos:', error);
        }
    }

    // Função de compartilhamento
    async function sharePhoto(photo) {
        const shareData = {
            title: 'Olha nossa foto!',
            text: photo.caption || 'Uma memória especial do nosso cantinho. ❤️',
            url: window.location.origin + photo.image_path // URL completa da imagem
        };

        try {
            // Usa a API de compartilhamento nativa do navegador, se disponível
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback para navegadores que não suportam a API
                alert('Seu navegador não suporta compartilhamento direto. Copie o link da imagem para compartilhar.');
                // Poderíamos também abrir pop-ups para redes sociais específicas aqui.
            }
        } catch (err) {
            console.error('Erro ao compartilhar:', err);
        }
    }

    // Evento de submit do formulário de upload
    photoUploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append('photo', photoInput.files[0]);
        formData.append('caption', captionInput.value);
        formData.append('username', username); // Envia o nome do usuário que fez o upload
        
        await fetch(`/api/photos/${coupleId}`, { method: 'POST', body: formData });
        photoUploadForm.reset(); // Limpa o formulário
        loadPhotos(); // Recarrega a galeria
    });

    // Carrega as fotos quando a página é aberta
    loadPhotos();
});