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

    // Pega o nome do usuário do localStorage
    const username = localStorage.getItem('bellaTrixUsername');
    // A foto de perfil agora virá com cada mensagem do servidor

    // Se não houver usuário, volta para a página de login
    if (!username) {
        window.location.href = 'login.html';
        return; // Para a execução do script
    }

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
        const senderElement = document.createElement('strong');
        senderElement.textContent = sender;

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

        // Cria um sub-container para o nome e a mensagem
        const contentContainer = document.createElement('div');
        contentContainer.append(senderElement, timestampElement); // Adiciona o timestamp aqui
        contentContainer.appendChild(messageElement);

        // Adiciona a foto e o conteúdo ao container principal
        // A ordem muda dependendo de quem enviou a mensagem
        if (sender === username) {
            messageContainer.append(contentContainer, profilePicElement);
        } else {
            messageContainer.append(profilePicElement, contentContainer);
        }

        // Adiciona a mensagem à caixa de chat
        chatMessages.appendChild(messageContainer);

        // Rola para a mensagem mais recente
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendMessage() {
        const messageText = chatInput.value.trim();
        if (messageText === "") {
            return; // Não envia mensagens vazias
        }

        // Cria um objeto de mensagem para enviar ao servidor
        const message = {
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
    socket.on('chat message', (msg) => {
        addMessageToChat(msg.sender, msg.text, msg.profile_pic, msg.created_at);
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
        socket.emit('typing', { sender: username });

        // Inicia um novo timer. Se ele terminar, significa que o usuário parou.
        typingTimer = setTimeout(() => {
            socket.emit('stop typing');
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
});