require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { default: axios } = require("axios");
const mongoose = require("mongoose")
const User = require("./User");
const { prompt, kzScripts, scripts } = require("./prompt");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Функция для задержки выполнения
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция для безопасной отправки сообщения
const safeSendMessage = async (client, chatId, message, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            await client.sendMessage(chatId, message);
            return true;
        } catch (error) {
            console.error(`Ошибка при отправке сообщения (попытка ${i+1}/${retries}):`, error);
            if (i < retries - 1) {
                // Ждем перед повторной попыткой
                await delay(2000 * (i + 1));
            } else {
                console.error("Не удалось отправить сообщение после нескольких попыток");
                return false;
            }
        }
    }
    return false;
};

mongoose
    .connect("mongodb://localhost:27017/CargoBot")
    .then(() => {
        console.log("Mongodb OK");
    })
    .catch((err) => {
        console.log("Mongodb Error", err);
    });

// Настройка WhatsApp клиента
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--memory-pressure-off',
            '--disable-background-timer-throttling',
            '--disable-breakpad',
            '--disable-extensions',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials'
        ],
        defaultViewport: null,
        timeout: 60000,
    },
    restartOnAuthFail: true,
});

// Флаг для отслеживания состояния клиента
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("QR код сгенерирован. Пожалуйста, отсканируйте его.");
});

client.on("authenticated", () => {
    console.log("Аутентификация успешна!");
    reconnectAttempts = 0;
});

client.on("auth_failure", (msg) => {
    console.error("Ошибка аутентификации:", msg);
    // Попытка переподключения
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        setTimeout(() => {
            client.initialize();
        }, 5000);
    } else {
        console.error("Превышено максимальное количество попыток переподключения");
    }
});

client.on("ready", () => {
    console.log("Клиент готов!");
    isClientReady = true;
    reconnectAttempts = 0;
});

client.on("disconnected", (reason) => {
    console.log("Клиент отключен:", reason);
    isClientReady = false;
    
    // Попытка переподключения
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        setTimeout(() => {
            client.initialize();
        }, 5000);
    } else {
        console.error("Превышено максимальное количество попыток переподключения");
    }
});

client.on('message_create', async (msg) => {
    try {
        if (msg.fromMe) {
            const chatId = msg.to;

            if (msg.body === "Здравствуйте. Меня зовут, Гуля. Я менеджер Cargo525.") {
                let user = await User.findOne({ phone: chatId });
                if (user) {
                    user.status = true
                    await user.save()
                } else {
                    user = new User({ phone: chatId, status:true });
                    await user.save();
                }
            }
        }
    } catch (error) {
        console.error("Ошибка в обработчике message_create:", error);
    }
});

client.on("message", async (msg) => {
    try {
        // Проверяем, готов ли клиент
        if (!isClientReady) {
            console.log("Клиент не готов, пропускаем сообщение");
            return;
        }

        const chatId = msg.from;
        const message = msg.body;
        
        // Получаем контакты с обработкой ошибок
        let contacts = [];
        try {
            contacts = await client.getContacts();
        } catch (error) {
            console.error("Ошибка при получении контактов:", error);
        }
        
        const contactExists = contacts.find(contact => contact.id._serialized === msg.from);
        let user = await User.findOne({ phone: chatId });

        if (contactExists?.name !== undefined || (user && user.status)) {
            console.log("Сообщение от контакта или пользователя со статусом true, пропускаем.");
            return;
        }
        
        if (!message || message.trim() === "") {
            await safeSendMessage(client, chatId, "Что бы отправить груз на наш склад и получить полную информацию Вам нужно присвоить КОД. Напишите Ваше ИМЯ, ГОРОД, ТЕЛЕФОН.");
            return;
        }

        if (!user) {
            user = new User({ phone: chatId });
            await user.save();
        }

        if (message) {
            try {
                const answer = await gptResponse(message);
                console.log("answer: ", answer);
                
                const isKZ = answer.toLocaleLowerCase().includes("kz")
                if (isKZ) {
                    user.language = "kz"
                    await user.save()
                }
                const match = answer.match(/\d+/g); // Ищем все последовательности цифр в строке
                if (match) {
                    const scriptIndex = parseInt(match[0], 10); // Преобразуем в число
                    const script = isKZ ? kzScripts[scriptIndex] : scripts[scriptIndex]; // Получаем соответствующий скрипт из массива
                    
                    if (scriptIndex === 7) {
                        if (user.language === "kz") {
                            await safeSendMessage(client, chatId, "Біздің менеджер сізге хабарласады, күте тұрыңыз.");
                        } else {
                            await safeSendMessage(client, chatId, "С вами выйдет на связь наш менеджер, просим ожидать.");
                        }
                        await safeSendMessage(client, "120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`);
                        user.status = true
                        await user.save()
                    } else if (scriptIndex === 6) {
                        if (user.language === "kz") {
                            await safeSendMessage(client, chatId, "Күте тұрыңыз, біз сізге код тағайындаймыз.");
                        } else {
                            await safeSendMessage(client, chatId, "Ожидайте, присвоим вам код.");
                        }
                        await safeSendMessage(client, "120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`);
                        user.status = true
                        await user.save()
                    } else {
                        if (script && Array.isArray(script)) {
                            // Отправляем все элементы массива как одно сообщение
                            const combinedMessage = script.join('\n');
                            await safeSendMessage(client, chatId, combinedMessage);
                        } else {
                            await safeSendMessage(client, chatId, "Ответ не найден. Уточните запрос.");
                        }
                    }
                } else {
                    if (user?.language === "kz") {
                        await safeSendMessage(client, chatId, "Сұрақты түсінбедім, нақтылап жазсаңыз.")
                    } else {
                        await safeSendMessage(client, chatId, "Не понял вопроса, уточните, пожалуйста.")
                    }
                }
            } catch (error) {
                console.error("Ошибка при обработке сообщения:", error);
                // Если произошла ошибка, попробуем отправить сообщение об ошибке
                try {
                    await safeSendMessage(client, chatId, "Произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте позже.");
                } catch (sendError) {
                    console.error("Не удалось отправить сообщение об ошибке:", sendError);
                }
            }
        }
    } catch (error) {
        console.error("Критическая ошибка в обработчике сообщений:", error);
    }
});

const gptResponse = async (text) => {
    try {
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
                timeout: 10000, // Таймаут 10 секунд
            }
        );

        const answer = response.data.choices[0].message.content;
        return answer;
    } catch (error) {
        console.error("Ошибка при запросе к GPT:", error);
        // Возвращаем значение по умолчанию в случае ошибки
        return "5";
    }
};

// Запуск клиента с обработкой ошибок
try {
    client.initialize();
} catch (error) {
    console.error("Ошибка при инициализации клиента:", error);
    // Попытка переподключения через 5 секунд
    setTimeout(() => {
        try {
            client.initialize();
        } catch (reconnectError) {
            console.error("Ошибка при повторной инициализации клиента:", reconnectError);
        }
    }, 5000);
}