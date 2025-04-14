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
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--memory-pressure-off',
            '--disable-background-timer-throttling',
            '--disable-breakpad'
        ],
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

client.on('message_create', async (msg) => {
    if (msg.fromMe) {
        const chatId = msg.to;

        if (msg.body === "Здравствуйте. Меня зовут, Гуля. Я менеджер Cargo525.") {
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
});

client.on("message", async (msg) => {
    const chatId = msg.from;
    const message = msg.body;
    const contacts = await client.getContacts();
    const contactExists = contacts.find(contact => contact.id._serialized === msg.from);
    let user = await User.findOne({ phone: chatId });

    if (contactExists?.name !== undefined || (user && user.status)) {
        console.log("Сообщение от контакта или пользователя со статусом true, пропускаем.");
        return;
    }
    if (!message || message.trim() === "") {
        return client.sendMessage(chatId, "Что бы отправить груз на наш склад и получить полную информацию Вам нужно присвоить КОД. Напишите Ваше ИМЯ, ГОРОД, ТЕЛЕФОН.");
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
            if (scriptIndex === 7) {
                if (user.language === "kz") {
                    await client.sendMessage(chatId, "Біздің менеджер сізге хабарласады, күте тұрыңыз.");
                } else {
                    await client.sendMessage(chatId, "С вами выйдет на связь наш менеджер, просим ожидать.");
                }
                client.sendMessage("120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
                user.status = true
                await user.save()
            } else if (scriptIndex === 6) {
                if (user.language === "kz") {
                    await client.sendMessage(chatId, "Күте тұрыңыз, біз сізге код тағайындаймыз.");
                } else {
                    await client.sendMessage(chatId, "Ожидайте, присвоим вам код.");
                }
                client.sendMessage("120363378709019183@g.us", `Клиенту с номером '${chatId.slice(0, -5)}' нужно написать wa.me//+${chatId.slice(0, -5)}`)
                user.status = true
                await user.save()
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


    const answer = response.data.choices[0].message.content;
    return answer;
};


client.initialize();