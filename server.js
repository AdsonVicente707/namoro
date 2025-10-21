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
    try {
        const [rows] = await dbPool.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // Retorna também o couple_id para o cliente
            res.json({ 
                success: true, 
                username: user.username, 
                coupleId: user.couple_id,
                profile_pic: user.profile_pic // Adiciona a foto de perfil na resposta
            });
        } else {
            res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// Rota para buscar todas as fotos do mural
app.get('/api/photos/:coupleId', async (req, res) => {
    const { coupleId } = req.params;
    try {
        const [photos] = await dbPool.execute(
            `SELECT p.id, p.image_path, p.caption, u.username as uploaded_by 
             FROM couple_photos p 
             LEFT JOIN users u ON p.uploaded_by_user_id = u.id 
             WHERE p.couple_id = ?
             ORDER BY p.created_at DESC`, [coupleId]
        );
        res.json(photos);
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
                `SELECT m.message_text, m.created_at, u.username, u.profile_pic 
                 FROM messages m
                 JOIN users u ON m.sender_user_id = u.id 
                 WHERE m.couple_id = ?
                 ORDER BY m.created_at ASC LIMIT 50`, [coupleId]
            );
            socket.emit('chat history', messages);
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