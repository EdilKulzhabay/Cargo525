require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { default: axios } = require("axios");
const mongoose = require("mongoose")
const User = require("./User");
const { prompt, kzScripts, scripts } = require("./prompt");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

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
    },
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
    console.log("Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.on("ready", () => {
    console.log("Client is ready!");
});

const startMessage = "Спасибо за обращение в M.O.O.N 🌕 APARTMENTS! Чем мы можем вам помочь?\n\nДля быстрого подбора апартаментов, ответьте пожалуйста на вопросы:\n\n1) дата заезда и выезда\n\n2) количество гостей и сколько комнат\n\n3) предпочтения по апартаментам, и приблизительный бюджет"

client.on("message", async (msg) => {
    const chatId = msg.from;
    const message = msg.body;
    const contacts = await client.getContacts();
    const contactExists = contacts.some(contact => contact.id._serialized === message.from);
    let user = await User.findOne({ phone: chatId });

    if (contactExists && user && user?.status) {
        return;
    }
    if (!message || message.trim() === "") {
        return client.sendMessage(chatId, "Пожалуйста, отправьте сообщение.");
    }

    if (!user) {
        user = new User({ phone: chatId });
        await user.save();
    }

    if (message) {
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
            if (scriptIndex === 6) {
                if (user.language === "kz") {
                    await client.sendMessage(chatId, "Күте тұрыңыз, біз сізге код тағайындаймыз.");
                } else {
                    await client.sendMessage(chatId, "Ожидайте, присвоим вам код.");
                }
                client.sendMessage("120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
            } else {
                if (script && Array.isArray(script)) {
                    // Отправляем сообщения последовательно
                    for (const item of script) {
                        await client.sendMessage(chatId, item);
                    }
                } else {
                    await client.sendMessage(chatId, "Ответ не найден. Уточните запрос.");
                }
            }
        } else {
            if (user?.language === "kz") {
                await client.sendMessage(chatId, "Сұрақты түсінбедім, нақтылап жазсаңыз.")
            } else {
                await client.sendMessage(chatId, "Не понял вопроса, уточните, пожалуйста.")
            }
        }
    }
});

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

    const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-3.5-turbo",
            messages,
        },
        {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
        }
    );


    const answer = response.data.choices[0].message.content;
    return answer;
};


client.initialize();