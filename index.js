require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { default: axios } = require("axios");
const mongoose = require("mongoose");
const User = require("./User");
const { prompt, kzScripts, scripts } = require("./prompt");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Подключение к MongoDB
mongoose
    .connect("mongodb://localhost:27017/CargoBot")
    .then(() => {
        console.log("MongoDB OK");
    })
    .catch((err) => {
        console.error("MongoDB Error:", err);
    });

// Настройка WhatsApp клиента
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox", 
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=TranslateUI",
            "--disable-web-security",
            "--no-first-run",
            "--no-default-browser-check"
        ],
        timeout: 90000, // Увеличенный таймаут до 90 секунд
        defaultViewport: null,
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("✅ Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
    console.error("❌ Authentication failed:", msg);
});

// Добавляем событие загрузки
client.on('loading_screen', (percent, message) => {
    console.log('⏳ Загрузка WhatsApp:', percent + '%', message);
});

// Добавляем событие смены состояния
client.on('change_state', state => {
    console.log('🔄 Состояние клиента:', state);
});

client.on("disconnected", (reason) => {
    console.log("❌ Client was logged out:", reason);
    // Перезапуск через 5 секунд
    setTimeout(() => {
        console.log("🔄 Attempting to reconnect...");
        client.initialize();
    }, 5000);
});

client.on("ready", async () => {
    console.log("🚀 Client is ready!");
    console.log("📱 Бот готов принимать сообщения!");
    
    // Получаем список всех групп для отладки
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        console.log(`📋 Доступные группы (${groups.length}):`);
        
        groups.forEach((group, index) => {
            console.log(`${index + 1}. "${group.name}" - ID: ${group.id._serialized}`);
        });
        
        // Ищем нужную группу
        const targetGroup = groups.find(group => 
            group.id._serialized === "120363378709019183@g.us" ||
            group.id._serialized.includes('120363378709019183') ||
            group.name === 'Cargo код клиента' ||
            group.name?.toLowerCase().includes('cargo код клиента')
        );
        
        if (targetGroup) {
            console.log(`✅ Целевая группа найдена: "${targetGroup.name}" - ID: ${targetGroup.id._serialized}`);
        } else {
            console.log(`⚠️ Целевая группа с ID 120363378709019183@g.us не найдена`);
            console.log(`💡 Проверьте, что бот добавлен в нужную группу`);
        }
        
    } catch (error) {
        console.error("❌ Ошибка при получении списка групп:", error);
    }
});

// Обработка исходящих сообщений
client.on("message_create", async (msg) => {
    if (msg.fromMe) {
        const chatId = msg.to;
        try {
            if (msg.body === "Здравствуйте. Меня зовут, Гуля. Я менеджер Cargo525.") {
                let user = await User.findOne({ phone: chatId });
                if (user) {
                    user.status = true;
                    await user.save();
                } else {
                    user = new User({ phone: chatId, status: true });
                    await user.save();
                }
            }
        } catch (error) {
            console.error("Ошибка при обработке message_create:", error);
        }
    }
});

// Обработка входящих сообщений
client.on("message", async (msg) => {
    const chatId = msg.from;
    const message = msg.body;

    try {
        // Проверка, является ли отправитель сохраненным контактом
        let isSavedContact = false;
        try {
            const contact = await msg.getContact();
            // Контакт считается сохраненным, если у него есть имя и оно не равно номеру телефона
            // или если есть pushname (имя из профиля WhatsApp)
            if (contact) {
                const contactName = contact.pushname || contact.name;
                const phoneNumber = contact.id.user || chatId.replace('@c.us', '').replace('@s.whatsapp.net', '');
                
                // Если есть имя и оно отличается от номера телефона - это сохраненный контакт
                if (contactName && contactName.trim() !== '' && contactName !== phoneNumber) {
                    isSavedContact = true;
                }
                
                // Дополнительная проверка через isMyContact, если доступно
                if (contact.isMyContact === true) {
                    isSavedContact = true;
                }
            }
        } catch (contactError) {
            // Если не удалось получить контакт, считаем что это не сохраненный контакт
            isSavedContact = false;
        }
        
        let user = await User.findOne({ phone: chatId });

        // Пропускаем сообщения от сохраненных контактов или пользователей со статусом true
        if (isSavedContact || (user && user.status)) {
            console.log(`Сообщение от ${isSavedContact ? 'сохраненного контакта' : 'пользователя со статусом true'}, пропускаем.`);
            return;
        }

        if (!message || message.trim() === "") {
            await client.sendMessage(chatId, "Что бы отправить груз на наш склад и получить полную информацию Вам нужно присвоить КОД. Напишите Ваше ИМЯ, ГОРОД, ТЕЛЕФОН.");
            return;
        }

        if (!user) {
            user = new User({ phone: chatId });
            await user.save();
        }

        if (message) {
            const answer = await gptResponse(message);
            console.log("Ответ GPT:", answer);

            const isKZ = answer.toLowerCase().includes("kz");
            if (isKZ) {
                user.language = "kz";
                await user.save();
            }

            const match = answer.match(/\d+/g); // Ищем все последовательности цифр
            if (match) {
                const scriptIndex = parseInt(match[0], 10);
                const script = isKZ ? kzScripts[scriptIndex] : scripts[scriptIndex];

                if (scriptIndex === 7) {
                    const responseMessage = user.language === "kz"
                        ? "Біздің менеджер сізге хабарласады, күте тұрыңыз."
                        : "С вами выйдет на связь наш менеджер, просим ожидать.";
                    await client.sendMessage(chatId, responseMessage);
                    
                    // Отправка уведомления в группу
                    await sendToGroup("120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`);
                    
                    user.status = true;
                    await user.save();
                } else if (scriptIndex === 6) {
                    const responseMessage = user.language === "kz"
                        ? "Күте тұрыңыз, біз сізге код тағайындаймыз."
                        : "Ожидайте, присвоим вам код.";
                    await client.sendMessage(chatId, responseMessage);
                    
                    // Отправка уведомления в группу
                    await sendToGroup("120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`);
                    
                    user.status = true;
                    await user.save();
                } else {
                    if (script && Array.isArray(script)) {
                        for (const item of script) {
                            await client.sendMessage(chatId, item);
                        }
                    } else {
                        await client.sendMessage(chatId, "Ответ не найден. Уточните запрос.");
                    }
                }
            } else {
                const responseMessage = user?.language === "kz"
                    ? "Сұрақты түсінбедім, нақтылап жазсаңыз."
                    : "Не понял вопроса, уточните, пожалуйста.";
                await client.sendMessage(chatId, responseMessage);
            }
        }
    } catch (error) {
        console.error("Ошибка при обработке сообщения:", error);
        if (error.name === "ProtocolError" || error.message.includes("Target closed")) {
            console.log("Попытка перезапуска клиента...");
            startClient();
        }
    }
});

// Функция для получения ответа от GPT
const gptResponse = async (text) => {
    const messages = [
        {
            role: "system",
            content: prompt,
        },
        {
            role: "user",
            content: text,
        },
    ];

    try {
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini",
                messages,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                },
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error("Ошибка в gptResponse:", error);
        return "Ошибка при обработке запроса GPT.";
    }
};

// Функция для безопасной отправки сообщения в группу
const sendToGroup = async (groupId, message) => {
    try {
        console.log(`🔄 Попытка отправки сообщения в группу ${groupId}`);
        
        // Метод 1: Через getChatById
        try {
            const groupChat = await client.getChatById(groupId);
            if (groupChat && groupChat.isGroup) {
                await groupChat.sendMessage(message);
                console.log(`✅ Сообщение отправлено в группу: ${groupChat.name || groupId}`);
                return true;
            }
        } catch (error1) {
            console.log(`❌ Метод 1 не сработал: ${error1.message}`);
        }

        // Метод 2: Через getChats
        try {
            const chats = await client.getChats();
            const group = chats.find(chat => chat.id._serialized === groupId && chat.isGroup);
            
            if (group) {
                await group.sendMessage(message);
                console.log(`✅ Сообщение отправлено в группу: ${group.name || groupId}`);
                return true;
            } else {
                console.error(`❌ Группа с ID ${groupId} не найдена среди чатов`);
            }
        } catch (error2) {
            console.log(`❌ Метод 2 не сработал: ${error2.message}`);
        }

        // Метод 3: Попробуем найти группу по имени
        try {
            const chats = await client.getChats();
            const groups = chats.filter(chat => chat.isGroup);
            console.log(`📋 Найдено групп: ${groups.length}`);
            
            // Выводим все доступные группы для отладки
            groups.forEach(group => {
                console.log(`📝 Группа: ${group.name} - ID: ${group.id._serialized}`);
            });
            
            // Если ID не совпадает, пытаемся найти по части ID или точному имени
            const targetGroup = groups.find(group => 
                group.id._serialized.includes('120363378709019183') || 
                group.name === 'Cargo код клиента' ||
                group.name?.toLowerCase().includes('cargo код клиента') ||
                group.name?.toLowerCase().includes('cargo')
            );
            
            if (targetGroup) {
                await targetGroup.sendMessage(message);
                console.log(`✅ Сообщение отправлено в группу по альтернативному поиску: ${targetGroup.name}`);
                return true;
            }
            
        } catch (error3) {
            console.log(`❌ Метод 3 не сработал: ${error3.message}`);
        }

        console.error(`❌ Все методы отправки в группу ${groupId} не сработали`);
        return false;
        
    } catch (error) {
        console.error(`❌ Общая ошибка при отправке сообщения в группу ${groupId}:`, error.message);
        return false;
    }
};

// Функция для инициализации клиента с перезапуском
async function startClient() {
    try {
        await client.initialize();
    } catch (error) {
        console.error("Ошибка при инициализации клиента:", error);
        console.log("Повторная попытка через 5 секунд...");
        setTimeout(startClient, 5000); // Перезапуск через 5 секунд
    }
}

// Запуск клиента
startClient();