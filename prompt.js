export const prompt = `
Ты — бот компании Cargo525. Твоя задача — отвечать строго по правилам:
Если пользователь спрашивает о работе компании (например, чем занимается компания, какие услуги оказывает), всегда отвечай цифрой "1".
Если пользователь спрашивает про адреса (например, где находятся склады, куда доставляется груз), всегда отвечай цифрой "2".
Если пользователь спрашивает как рассчитать сумму заказа, всегда отвечай цифрой "3".
Если пользователью нужна помощь с поиском товара, всегда отвечай цифрой "4".
Если пользователь просит точные адреса складов и хочет начать работать, всегда отвечай цифрой "5".
Если пользователь написал своё имя, номер телефона и город, всегда отвечай цифрой "6".
Если сообщение не относится ни к одному из этих случаев, отвечай: "Не понял вопроса, уточните, пожалуйста.".
`
export const scripts = [
    [],
    [
`Cargo525: ежедневные отправки грузов из Китая в Казахстан и Россию!

Каждый день мы осуществляем отправки грузов из Китая в Казахстан и Россию, чтобы ваш бизнес работал без задержек и в срок!

📍 Склады и условия приема груза:

    •	Иу и Шэньчжэнь — приём грузов от 1 кг.
    •	Гуанчжоу — приём грузов от 20 кг.

🚚 Виды доставки:

    •	ЖД контейнер — экономичный способ для крупных партий.
    •	Быстрая авто доставка — всего от 10 дней на доставку, чтобы товары прибыли максимально быстро.`,
`Сроки авто доставки:
до Алматы 7-10 дней
до Москвы 10-15 дней

Сроки доставки ЖД контейнером:
До Алматы 25-35 дней
До Москвы 35-45 дней`,
`Наши услуги

* Доставка грузов из Китая в Казахстан и Россию
* Собственные склады в Гуанчжоу, Иу, Шэньчжэне, Алматы, Астане, Караганде, Москве
* Поиск товаров и помощь в переговорах с поставщиками
* Помощь с оплатой поставщику
* Проверка товара на качество
* Пополнение баланса Alipay

Мы предлагаем полный спектр услуг`
    ],
    [
` Наши склады в городах:

📍Иу, Гуанчжоу, Шэньчжэнь (Китай)

📍Алматы, Астана, Караганды (Казахстан)

📍Москва (Россия)`
    ],
    [
`Стоимости доставки расчитывается исходя из плотности груза`,
`‼️ как посчитать  ПРИМЕРНУЮ стоимость доставки ‼️Пример

Плотность = кг / м3
Нужно уточнить вес и объём (в м3) у поставщика. 
Вычислить плотность груза. 
И по плотности груза уточнить стоимость доставки. 

Например: вес 27 кг. 
Размеры: 0,5м*0,25м*0,75м
Объём: 0.093 м3
Плотность 27кг/0.093 м3= 290.3

Смотрите 10 пункт Таблицы. 
Стоимость быстрой доставкой составит - 3.0$ за кг. 
27кг * 3.0$ = 81$ (без учёта стоимости упаковки)`
    ],
    [
`+77476048442 менеджер Моника. Поможет с поиском товара. Выкуп.`
    ],
    [
`Что бы отправить груз на наш склад и получить полную информацию Вам нужно присвоить КОД. Напишите Ваше ИМЯ, ГОРОД, ТЕЛЕФОН.`
    ]
]