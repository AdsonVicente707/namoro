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
    user: 'adson', // Mude se o seu usuário for diferente
    password: '123', // <<< COLOQUE SUA SENHA DO MYSQL AQUI
    database: 'bellatrix_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- Configuração do Multer para Upload de Imagens ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/'); // Salva as imagens na pasta 'public/uploads'
    },
    filename: (req, file, cb) => {
        // Garante um nome de arquivo único
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Middlewares ---
app.use(express.json()); // Para parsear JSON no corpo das requisições
app.use(express.urlencoded({ extended: true })); // Para parsear formulários

const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Rotas da API ---

// Rota de Registro
app.post('/api/register', upload.single('profilePic'), async (req, res) => {
    const { username, password } = req.body;
    const profilePicPath = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await dbPool.execute(
            'INSERT INTO users (username, password, profile_pic) VALUES (?, ?, ?)',
            [username, hashedPassword, profilePicPath]
        );
        res.status(201).json({ success: true, message: 'Usuário criado com sucesso!' });
    } catch (error) {
        console.error('Erro no registro:', error);
        // Código 'ER_DUP_ENTRY' para usuário duplicado
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Este nome de usuário já existe.' });
        }
        res.status(500).json({ success: false, message: 'Erro ao registrar usuário.' });
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
            res.json({ success: true, username: user.username, profile_pic: user.profile_pic });
        } else {
            res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// Lógica do Socket.IO para o chat
io.on('connection', async (socket) => {
  console.log('Um usuário se conectou');

  // Enviar histórico de mensagens ao novo usuário
  try {
    const [messages] = await dbPool.execute(
        `SELECT m.message_text, u.username, u.profile_pic 
         FROM messages m
         JOIN users u ON m.user_id = u.id 
         ORDER BY m.created_at ASC`
    );
    socket.emit('chat history', messages);
  } catch (error) {
    console.error("Erro ao buscar histórico de mensagens:", error);
  }

  socket.on('chat message', async (msg) => { // msg agora inclui sender, text, created_at
    try {
        // 1. Encontrar o ID do usuário
        const [users] = await dbPool.execute('SELECT id, profile_pic FROM users WHERE username = ?', [msg.sender]);
        if (users.length > 0) {
            const user = users[0];
            // 2. Salvar a mensagem no banco de dados
            await dbPool.execute('INSERT INTO messages (user_id, message_text, created_at) VALUES (?, ?, ?)', [user.id, msg.text, msg.created_at]);
            
            // 3. Enviar a mensagem para todos os clientes com os dados corretos
            const messageToSend = { sender: msg.sender, text: msg.text, profile_pic: user.profile_pic, created_at: msg.created_at };
            io.emit('chat message', messageToSend);
        }
    } catch (error) {
        console.error("Erro ao salvar ou enviar mensagem:", error);
    }
  });

  // Lógica de "usuário digitando"
  socket.on('typing', (data) => {
    // Envia para todos, exceto para o remetente
    socket.broadcast.emit('user typing', data);
  });

  socket.on('stop typing', () => {
    socket.broadcast.emit('user stop typing');
  });

  socket.on('disconnect', () => {
    console.log('Um usuário se desconectou');
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});