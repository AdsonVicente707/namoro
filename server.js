const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Configuração do Banco de Dados ---
const dbPool = mysql.createPool({
    host: 'localhost',
    port: 3307, // Adicionamos a porta que alteramos no docker-compose
    user: 'root', // Usuário padrão do XAMPP/WAMP
    password: '',   // Senha padrão do XAMPP/WAMP é vazia
    database: 'bellatrix_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Salva as imagens na pasta 'uploads'
    },
    filename: (req, file, cb) => {
        // Garante um nome de arquivo único
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Middlewares ---
app.use(express.json()); // Para parsear JSON no corpo das requisições
// Serve os arquivos da pasta 'uploads' estaticamente
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true })); // Para parsear formulários

const PORT = process.env.PORT || 80; // Mantendo a porta 80 conforme solicitado

// Rota principal para servir a página de login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve os arquivos estáticos (CSS, JS, imagens) da pasta raiz do projeto.
// Esta linha deve vir DEPOIS da rota principal para não interceptá-la.
app.use(express.static(__dirname));

// --- Rotas da API ---

// Rota de Registro
app.post('/api/register', upload.single('profilePic'), async (req, res) => {
    const { username, password, inviteCode } = req.body;
    const profilePicPath = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        let coupleId;
        let message = 'Perfil do casal criado! Compartilhe o código de convite com seu amor.';
        let finalInviteCode;

        if (inviteCode) {
            // Juntando-se a um casal existente
            const [couples] = await dbPool.execute('SELECT id FROM couples WHERE invite_code = ?', [inviteCode]);
            if (couples.length === 0) {
                return res.status(404).json({ success: false, message: 'Código de convite inválido.' });
            }
            coupleId = couples[0].id;
            message = 'Você se juntou ao perfil do casal com sucesso!';
        } else {
            // Criando um novo casal
            finalInviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const [newCouple] = await dbPool.execute('INSERT INTO couples (invite_code) VALUES (?)', [finalInviteCode]);
            coupleId = newCouple.insertId;
            message = `Perfil do casal criado! Seu código de convite é: ${finalInviteCode}`;
        }

        // Insere o novo usuário
        await dbPool.execute(
            'INSERT INTO users (couple_id, username, password, profile_pic) VALUES (?, ?, ?, ?)',
            [coupleId, username, hashedPassword, profilePicPath]
        );

        res.status(201).json({ success: true, message: message });

    } catch (error) {
        console.error('Erro no registro:', error);
        // Tratamento de erro genérico, pode ser melhorado para casos específicos
        res.status(500).json({ success: false, message: 'Erro interno ao registrar usuário.' });
    }
});

// Rota de Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // Usuários e senha permitidos
    const allowedUsers = ['adson', 'isabella'];
    const correctPassword = '0209';

    // Verifica se o usuário e a senha estão corretos
    if (allowedUsers.includes(username.toLowerCase()) && password === correctPassword) {
        // Login bem-sucedido
        // Retorna uma resposta que o frontend espera, com valores fixos.
        // O coupleId é fixo como '1' para garantir que ambos caiam na mesma "sala".
        // A foto de perfil é um placeholder genérico.
        res.json({
            success: true,
            username: username,
            coupleId: '1', // ID do casal fixo para ambos os usuários
            profile_pic: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👤</text></svg>'
        });
    } else {
        // Login falhou
        res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
    }
});

// Rota para buscar todas as fotos do mural
app.get('/api/photos/:coupleId', async (req, res) => {
    const { coupleId } = req.params;
    const { username } = req.query; // Pega o username dos parâmetros da query

    try {
        // Pega o ID do usuário que está fazendo a requisição
        const [users] = await dbPool.execute('SELECT id FROM users WHERE username = ?', [username]);
        const requestingUserId = users.length > 0 ? users[0].id : null;

        const [photos] = await dbPool.execute(
            `SELECT 
                p.id, 
                p.image_path, 
                p.caption, 
                u.username as uploaded_by,
                (SELECT COUNT(*) FROM photo_likes pl WHERE pl.photo_id = p.id) as like_count,
                (SELECT COUNT(*) FROM photo_likes pl WHERE pl.photo_id = p.id AND pl.user_id = ?) as user_has_liked
             FROM couple_photos p
             LEFT JOIN users u ON p.uploaded_by_user_id = u.id
             WHERE p.couple_id = ? 
             ORDER BY p.created_at DESC`,
            [requestingUserId, coupleId]
        );
        // Converte user_has_liked para booleano
        const photosWithLikes = photos.map(p => ({ ...p, user_has_liked: p.user_has_liked > 0 }));
        res.json(photosWithLikes);
    } catch (error) {
        console.error('Erro ao buscar fotos do mural:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar fotos.' });
    }
});

// Rota para adicionar uma nova foto ao mural
app.post('/api/photos/:coupleId', upload.single('photo'), async (req, res) => {
    const { coupleId } = req.params;
    const { caption, username } = req.body; // username de quem fez o upload
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!imagePath) {
        return res.status(400).json({ success: false, message: 'Nenhuma imagem enviada.' });
    }

    try {
        const [users] = await dbPool.execute('SELECT id FROM users WHERE username = ?', [username]);
        const userId = users.length > 0 ? users[0].id : null;

        await dbPool.execute(
            'INSERT INTO couple_photos (couple_id, image_path, caption, uploaded_by_user_id) VALUES (?, ?, ?, ?)',
            [coupleId, imagePath, caption, userId]
        );
        res.status(201).json({ success: true, message: 'Foto adicionada com sucesso!' });
    } catch (error) {
        console.error('Erro ao adicionar foto:', error);
        res.status(500).json({ success: false, message: 'Erro ao salvar a foto.' });
    }
});

// Rota para curtir/descurtir uma foto
app.post('/api/photos/:photoId/like', async (req, res) => {
    const { photoId } = req.params;
    const { username } = req.body;

    try {
        // 1. Encontrar o ID do usuário
        const [users] = await dbPool.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(403).json({ success: false, message: 'Usuário inválido.' });
        }
        const userId = users[0].id;

        // 2. Verificar se o usuário já curtiu a foto
        const [likes] = await dbPool.execute('SELECT id FROM photo_likes WHERE user_id = ? AND photo_id = ?', [userId, photoId]);

        if (likes.length > 0) {
            // Se já curtiu, descurte (remove o like)
            await dbPool.execute('DELETE FROM photo_likes WHERE id = ?', [likes[0].id]);
        } else {
            // Se não curtiu, curta (adiciona o like)
            await dbPool.execute('INSERT INTO photo_likes (user_id, photo_id) VALUES (?, ?)', [userId, photoId]);
        }

        // 3. Retornar a nova contagem de curtidas
        const [countResult] = await dbPool.execute('SELECT COUNT(*) as like_count FROM photo_likes WHERE photo_id = ?', [photoId]);
        const newLikeCount = countResult[0].like_count;

        res.json({
            success: true,
            newLikeCount: newLikeCount
        });
    } catch (error) {
        console.error('Erro ao curtir/descurtir foto:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// Rota para EXCLUIR uma foto do mural
app.delete('/api/photos/:photoId', async (req, res) => {
    const { photoId } = req.params;
    const { username } = req.body; // Username de quem está pedindo para excluir

    if (!username) {
        return res.status(400).json({ success: false, message: 'Nome de usuário não fornecido.' });
    }

    try {
        // 1. Pega o ID do usuário que está fazendo a requisição
        const [requestingUsers] = await dbPool.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (requestingUsers.length === 0) {
            return res.status(403).json({ success: false, message: 'Usuário inválido.' });
        }
        const requestingUserId = requestingUsers[0].id;

        // 2. Pega os detalhes da foto, incluindo quem a postou e o caminho do arquivo
        const [photos] = await dbPool.execute('SELECT uploaded_by_user_id, image_path FROM couple_photos WHERE id = ?', [photoId]);
        if (photos.length === 0) {
            return res.status(404).json({ success: false, message: 'Foto não encontrada.' });
        }
        const photo = photos[0];

        // 3. Verifica se o usuário que pediu para excluir é o mesmo que postou
        if (photo.uploaded_by_user_id !== requestingUserId) {
            return res.status(403).json({ success: false, message: 'Você não tem permissão para excluir esta foto.' });
        }

        // 4. Exclui a foto do banco de dados
        await dbPool.execute('DELETE FROM couple_photos WHERE id = ?', [photoId]);

        res.json({ success: true, message: 'Foto excluída com sucesso.' });
    } catch (error) {
        console.error('Erro ao excluir foto:', error);
        res.status(500).json({ success: false, message: 'Erro ao excluir a foto.' });
    }
});

// Lógica do Socket.IO para o chat
io.on('connection', async (socket) => {
    console.log('Um usuário se conectou');

    // Usuário se junta a uma "sala" específica do casal
    socket.on('join couple room', async (coupleId) => {
        socket.join(coupleId);
        console.log(`Usuário entrou na sala do casal: ${coupleId}`);

        // Enviar histórico de mensagens do casal
        try {
            const [messages] = await dbPool.execute(
                `SELECT m.id, m.message_text, m.created_at, u.username, u.profile_pic 
                 FROM messages m
                 JOIN users u ON m.sender_user_id = u.id 
                 WHERE m.couple_id = ?
                 ORDER BY m.created_at DESC LIMIT 30`, [coupleId] // DESC para pegar as mais recentes
            );
            socket.emit('chat history', messages.reverse()); // Reverte para enviar em ordem cronológica
        } catch (error) {
            console.error("Erro ao buscar histórico de mensagens:", error);
        }
    });

  socket.on('chat message', async (msg) => { // msg: { coupleId, sender, text, created_at }
    try {
        // 1. Encontrar o ID e a foto do usuário que enviou
        const [users] = await dbPool.execute('SELECT id, profile_pic FROM users WHERE username = ?', [msg.sender]);
        if (users.length > 0) {
            const user = users[0];
            // 2. Salvar a mensagem no banco de dados
            await dbPool.execute(
                'INSERT INTO messages (couple_id, sender_user_id, message_text, created_at) VALUES (?, ?, ?, ?)', 
                [msg.coupleId, user.id, msg.text, new Date(msg.created_at)]
            );
            
            // 3. Enviar a mensagem para todos na sala do casal
            const messageToSend = { 
                username: msg.sender, 
                message_text: msg.text, 
                profile_pic: user.profile_pic, 
                created_at: msg.created_at 
            };
            io.to(msg.coupleId).emit('chat message', messageToSend);
        }
    } catch (error) {
        console.error("Erro ao salvar ou enviar mensagem:", error);
    }
  });

  // Novo evento para carregar mensagens mais antigas
  socket.on('request older messages', async (data) => {
    const { coupleId, oldestMessageId } = data;
    try {
        const [messages] = await dbPool.execute(
            `SELECT m.id, m.message_text, m.created_at, u.username, u.profile_pic 
             FROM messages m
             JOIN users u ON m.sender_user_id = u.id 
             WHERE m.couple_id = ? AND m.id < ?
             ORDER BY m.created_at DESC LIMIT 20`, // Busca 20 mensagens mais antigas
            [coupleId, oldestMessageId]
        );

        // Envia as mensagens mais antigas de volta para o cliente que pediu
        // Reverte para que o cliente possa prependê-las na ordem correta (mais antiga primeiro)
        socket.emit('older messages loaded', messages.reverse());
    } catch (error) {
        console.error("Erro ao buscar mensagens antigas:", error);
    }
  });

  // Lógica de "usuário digitando"
  socket.on('typing', (data) => { // data: { coupleId, sender }
    // Envia para a sala do casal, exceto para o remetente
    socket.to(data.coupleId).emit('user typing', data);
  });

  socket.on('stop typing', (data) => { // data: { coupleId }
    socket.to(data.coupleId).emit('user stop typing');
  });

  socket.on('disconnect', () => {
    console.log('Um usuário se desconectou');
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});