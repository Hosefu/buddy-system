const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const TurndownService = require('turndown');

const app = express();
const port = 3000;

const docsDir = __dirname;
const htmlFile = path.join(docsDir, 'Спецификация2.html');
const mdFile = path.join(docsDir, 'Спецификация.md');

const turndownService = new TurndownService();

app.use(express.static(docsDir));
app.use(bodyParser.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.sendFile(htmlFile);
});

app.post('/save', (req, res) => {
    const { html } = req.body;
    if (!html) {
        return res.status(400).json({ message: 'Нет содержимого для сохранения.' });
    }

    fs.writeFile(htmlFile, html, 'utf8', (err) => {
        if (err) {
            console.error('Ошибка при сохранении файла:', err);
            return res.status(500).json({ message: 'Не удалось сохранить файл.' });
        }
        res.status(200).json({ message: 'Файл успешно сохранен.' });
    });
});

app.post('/generate-md', (req, res) => {
    const { html } = req.body;
    if (!html) {
        return res.status(400).json({ message: 'Нет HTML для конвертации.' });
    }

    const markdown = turndownService.turndown(html);

    fs.writeFile(mdFile, markdown, 'utf8', (err) => {
        if (err) {
            console.error('Ошибка при сохранении MD файла:', err);
            return res.status(500).json({ message: 'Не удалось сохранить MD файл.' });
        }
        res.status(200).json({ message: `Markdown файл успешно создан: ${path.basename(mdFile)}` });
    });
});

app.listen(port, () => {
    console.log(`Сервер для редактирования документации запущен.`);
    console.log(`Откройте http://localhost:${port} в браузере.`);
    console.log(`Для установки/обновления зависимостей выполните \`cd docs && npm install\`.`);
    console.log(`Для запуска сервера выполните \`cd docs && npm start\`.`);
}); 