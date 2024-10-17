const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Inicializa o cliente WhatsApp com a estratégia de autenticação local
const client = new Client({
    authStrategy: new LocalAuth()
});

// Gerar QR Code para conectar
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Escaneie o QR code para conectar.');
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('Bot Free Lancer conectado ao WhatsApp!');
});

// Variáveis para controle do sistema anti-link e anti-spam
let antiLinkEnabled = false;
const messageCount = {}; // Para controle de mensagens iguais
const SPAM_THRESHOLD = 5; // Limite de mensagens iguais
const BANNED_USERS = {}; // Armazena usuários banidos
const BAN_TIMEOUT = 10000; // Tempo de espera para poder banir novamente (10 sgnds)

// Reseta o estado de banimento após o tempo especificado
async function resetBan(sender) {
    setTimeout(() => {
        if (BANNED_USERS[sender]) {
            delete BANNED_USERS[sender]; // Remove o usuário da lista de banidos
            console.log(`Usuário ${sender} pode ser banido novamente.`);
        }
    }, BAN_TIMEOUT);
}

// Verifica se o usuário é admin
async function isAdmin(chat, userId) {
    const participant = chat.participants.find(p => p.id._serialized === userId);
    return participant && participant.isAdmin;
}

// Comandos de gerenciamento do grupo: /kick
client.on('message', async msg => {
    const chat = await msg.getChat();

    // Verifica se é um grupo
    if (!chat.isGroup) return; // O bot não responderá em chats privados

    // Comando /kick para remover o usuário mencionado
    if (msg.body.startsWith('/kick')) {
        const mentionedUserId = msg.mentionedIds[0]; // Pega o primeiro usuário mencionado
        if (mentionedUserId) {
            if (!await isAdmin(chat, msg.author)) {
                return msg.reply('Você não tem permissão para executar este comando.');
            }
            try {
                await chat.removeParticipants([mentionedUserId]);
                await msg.reply('Usuário removido com sucesso.');
            } catch (err) {
                console.error('Erro ao remover usuário:', err);
                msg.reply('Erro ao remover usuário. Verifique as permissões.');
            }
        } else {
            msg.reply('Você precisa mencionar o usuário que deseja kickar usando @.');
        }
    }

    // Sistema anti-link
    const linkRegex = /https?:\/\/[^\s]+|www\.[^\s]+/; // Regex para identificar qualquer tipo de link

    if (antiLinkEnabled && linkRegex.test(msg.body)) {
        try {
            await msg.reply('🚫 Links não são permitidos!');
            if (msg.author !== chat.owner) { // Evita que o dono seja removido
                await chat.removeParticipants([msg.author]);
                console.log('Usuário banido por enviar link.');
            }
        } catch (err) {
            console.error('Erro ao banir usuário por link:', err);
        }
    }

    // Sistema anti-spam
    const sender = msg.author || msg.from; // ID do autor da mensagem
    const messageContent = msg.body; // Conteúdo da mensagem

    // Inicializa o contador de mensagens do usuário
    if (!messageCount[sender]) {
        messageCount[sender] = { count: 0, lastMessageContent: null };
    }

    const userData = messageCount[sender];

    // Verifica se a mensagem é igual à última
    if (userData.lastMessageContent === messageContent) {
        userData.count += 1; // Incrementa o contador
    } else {
        userData.count = 1; // Reinicia o contador
    }

    userData.lastMessageContent = messageContent; // Atualiza a última mensagem

    // Verifica se o usuário enviou mais mensagens iguais do que o limite
    if (userData.count > SPAM_THRESHOLD) {
        // Banir o usuário
        if (!BANNED_USERS[sender]) {
            BANNED_USERS[sender] = { banned: true, count: 0 }; // Marca o usuário como banido
            try {
                await chat.removeParticipants([sender]);
                console.log(`Usuário ${sender} foi banido por enviar mensagens iguais em excesso.`);
                await msg.reply('Você foi banido por enviar mensagens iguais em excesso.');
                resetBan(sender); // Inicia o temporizador para reiniciar o banimento
            } catch (err) {
                console.error('Erro ao banir usuário por spam:', err);
            }
        }
    }

    // Comando /on para abrir o grupo (todos podem enviar mensagens)
    if (msg.body === '/on') {
        if (await isAdmin(chat, msg.author)) {
            try {
                await chat.setMessagesAdminsOnly(false);
                msg.reply('Bom dia! O Grupo foi aberto novamente. Agora todos os membros podem enviar mensagens.');
            } catch (err) {
                console.error('Erro ao abrir o grupo:', err);
                msg.reply('Erro ao abrir o grupo. Verifique as permissões.');
            }
        } else {
            msg.reply('Você não tem permissão para executar este comando.');
        }
    }

    // Comando /off para fechar o grupo (somente admins podem enviar mensagens)
    if (msg.body === '/off') {
        if (await isAdmin(chat, msg.author)) {
            try {
                await chat.setMessagesAdminsOnly(true);
                msg.reply('🔒 O grupo foi fechado... Desculpe, mas usamos o recurso de fechar o grupo no horário de 00:00 para ter um melhor controle e gerenciamento do grupo.');
            } catch (err) {
                console.error('Erro ao fechar o grupo:', err);
                msg.reply('Erro ao fechar o grupo. Verifique as permissões.');
            }
        } else {
            msg.reply('Você não tem permissão para executar este comando.');
        }
    }

    // Comando para ativar ou desativar o sistema anti-link
    if (msg.body === '/antlink on') {
        if (await isAdmin(chat, msg.author)) {
            antiLinkEnabled = true;
            msg.reply('✅ O sistema anti-link foi ativado com sucesso senhor. Usuários que enviarem links no grupo serão banidos.');
        } else {
            msg.reply('Você não tem permissão para executar este comando.');
        }
    }

    if (msg.body === '/antlink off') {
        if (await isAdmin(chat, msg.author)) {
            antiLinkEnabled = false;
            msg.reply('❌ É uma pena! O senhor desativou o sistema anti-link. Agora links são permitidos.');
        } else {
            msg.reply('Você não tem permissão para executar este comando.');
        }
    }
});

// Evento quando um usuário entra no grupo
client.on('group_join', async (notification) => {
    const chat = await notification.getChat();
    const newParticipant = notification.author; // ID do novo participante

    // Verifica se o novo participante está na lista de banidos
    if (BANNED_USERS[newParticipant]) {
        try {
            await chat.removeParticipants([newParticipant]);
            console.log(`Usuário ${newParticipant} foi banido ao entrar no grupo.`);
        } catch (err) {
            console.error('Erro ao banir usuário ao entrar no grupo:', err);
        }
    } else {
        // Reinicia a contagem de mensagens para o novo participante
        messageCount[newParticipant] = { count: 0, lastMessageContent: null };
    }
});

// Autorreconexão caso o bot desligue
client.on('disconnected', (reason) => {
    console.log('Bot desconectado: ', reason);
    client.initialize();
});

// Inicializa o cliente
client.initialize();
