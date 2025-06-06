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
        ],
        timeout: 60000, // Увеличенный таймаут
    },
    webVersion: "2.2412.54", // Явно указываем версию WhatsApp Web
    webVersionCache: { type: "local" }, // Локальное кэширование версии
});

// Обработка QR-кода
client.on("qr", (qr) => {
    console.log("QR код сгенерирован");
    qrcode.generate(qr, { small: true });
});

// Успешная аутентификация
client.on("authenticated", () => {
    console.log("Authenticated successfully!");
});

// Ошибка аутентификации
client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

// Клиент готов
client.on("ready", () => {
    console.log("Client is ready!");
});

// Обработка отключения
client.on("disconnected", (reason) => {
    console.error("Client disconnected:", reason);
    startClient(); // Перезапуск клиента
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
        const contacts = await client.getContacts();
        const contactExists = contacts.find((contact) => contact.id._serialized === msg.from);
        let user = await User.findOne({ phone: chatId });

        if (contactExists?.name !== undefined || (user && user.status)) {
            console.log("Сообщение от контакта или пользователя со статусом true, пропускаем.");
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
                    await client.sendMessage(
                        "120363378709019183@g.us",
                        `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`
                    );
                    user.status = true;
                    await user.save();
                } else if (scriptIndex === 6) {
                    const responseMessage = user.language === "kz"
                        ? "Күте тұрыңыз, біз сізге код тағайындаймыз."
                        : "Ожидайте, присвоим вам код.";
                    await client.sendMessage(chatId, responseMessage);
                    await client.sendMessage(
                        "120363378709019183@g.us",
                        `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`
                    );
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