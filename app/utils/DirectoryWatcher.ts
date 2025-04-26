import chokidar from 'chokidar';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { Image } from 'image-js';
import { JSDOM } from 'jsdom';
import { createHash } from 'crypto';

const darkModeIgnorePath: string = path.join(process.cwd(), 'public/files/dark-mode-ignore.md')
const rootDir = process.cwd() + '/public/files';
const retryLimit = 5;
const fileHashes = new Map<string, string>();           // Map for storing files' hashes
const browser = await puppeteer.launch();      // Setup for
const page = await browser.newPage();             // PDF conversion
fs.writeFileSync('hash.log', '');    // Wipe the hash log file
fs.writeFileSync('filedir.log', ''); // Wipe the directory watcher log file

const watcher = chokidar.watch(rootDir, {
    persistent: true,
    ignored: /^\./,
    usePolling: true,
    interval: 1000,
    binaryInterval: 3000,
    awaitWriteFinish: true
});
console.log(`Watching directory: ${rootDir}`);

const fileQueue: string[] = [];
const messageQueue: string[] = [];
let fileThreadTaken = false;
let messageThreadTaken = false;

watcher
    .on('add', (filepath) => {
        messageQueue.push(`Added file: ${filepath.split('files/')[1]}`);
        processNextMessage();
        fileQueue.push(filepath);
        processNextFile();
    })
    .on('change', (filepath) => {
        messageQueue.push(`Changed file: ${filepath.split('files/')[1]}`);
        processNextMessage();
        fileQueue.push(filepath);
        processNextFile();
    });

async function processNextMessage() {
    if (messageThreadTaken || messageQueue.length === 0) {
        return;
    }
    messageThreadTaken = true;
    const message = messageQueue.shift();
    if (message) {
        console.log(message);
        fs.appendFileSync(message.toLowerCase().includes('hash') ? 'hash.log' : 'filedir.log',message + '\n');
    } else {
        messageThreadTaken = false;
        return;
    }
    messageThreadTaken = false;
    await processNextMessage();
}

async function processNextFile(): Promise<void> {
    if (fileThreadTaken || fileQueue.length === 0) {
        return;
    }
    fileThreadTaken = true;
    const filepath = fileQueue.shift();
    if (filepath){
        // Check the hash & process
        const hash: string = calculateFileHash(filepath);
        if (fileHashes.has(filepath) && fileHashes.get(filepath) == hash) {
            messageQueue.push("File hashes match - ignoring file " + filepath.split('files/')[1]);
            await processNextMessage();
            fileThreadTaken = false;
            return;
        }
        fileHashes.set(filepath, hash);
        messageQueue.push(`Hash set for ${filepath.split('files/')[1]}`);
        await processNextMessage();
        await processFile(filepath);
    } else {
        messageQueue.push("Bad file path");
        await processNextMessage();
        fileThreadTaken = false;
        return;
    }
    fileThreadTaken = false;
    await processNextFile();
}

async function processFile(filepath: string): Promise<void> {
    // 1 - Check filetype
    // 2 - if .md - html + pdf both themes
    // 3 - if .png .jpg - convert to darkmode
    // 4 - .gif - do nothing
    // 5 - Contains 'darkmode' or 'lightmode' - unwatch
    // Otherwise - not supported

    if (filepath.includes('lightmode') || filepath.includes('darkmode')) {
        messageQueue.push('Darkmode/lightmode file detected - unwatching');
        await processNextMessage();
        watcher.unwatch(filepath);
    } else if (filepath.endsWith('.png') || filepath.endsWith('.jpg')) {
        // Dark mode conversion

        if (ignored(filepath)) {
            messageQueue.push(`Ignoring file ${filepath.split('files/')[1]}: in ignore file, unwatching`);
            await processNextMessage();
            watcher.unwatch(filepath);
        } else if (await isDark(filepath)) {
            messageQueue.push(`Ignoring file ${filepath.split('files/')[1]}: already dark, unwatching`);
            await processNextMessage();
            watcher.unwatch(filepath);
        } else {
            messageQueue.push(`Converting file ${filepath.split('files/')[1]}`);
            await processNextMessage();
            const darkmodePath=
                filepath.endsWith('.jpg')
                    ? filepath.replace('.jpg', ' darkmode.jpg')
                    : filepath.replace('.png', ' darkmode.png');
            execSync(`magick '${filepath}' -colorspace HSL -channel L -level 100%,30% +level-colors 'rgb(0,0,20)','lemonchiffon' -black-threshold 20% '${darkmodePath}' && magick '${darkmodePath}' +level 10.98% '${darkmodePath}'`)
        }
    } else if (filepath.endsWith('.md')) {
        // Those are .md's - convert into html and pdf

        // HTML conversion
        if (filepath.endsWith('dark-mode-ignore.md')) { return; }
        messageQueue.push(`Converting ${filepath.split('files/')[1]} to html`);
        await processNextMessage();
        const html_filepath: string = filepath.replace('.md', '.html');
        execSync(`pandoc "${filepath}" -o "${html_filepath}" --from=gfm+hard_line_breaks --mathml`);
        let converted_html: string = fs.readFileSync(html_filepath, 'utf8');
        converted_html = converted_html.replaceAll('style="text-align: center"','style="text-align: -webkit-center"');
        converted_html = converted_html.replaceAll('¯','―');
        let convertedDarkmode = converted_html;
        const darkmodeHtml = html_filepath.replace('.html', ' darkmode.html');
        const lightmodeHtml = html_filepath.replace('.html', ' lightmode.html');

        // Change pictures to darkmodded where applicable
        const html: string = '';
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const dummy: HTMLHtmlElement = document.createElement('html');
        dummy.innerHTML = convertedDarkmode;
        const allImages = dummy.getElementsByTagName('img');
        for (let i: number = 0; i < allImages.length; i++) {
            // ^ Know it's suboptimal, dgaf
            const imgPath = filepath.split('/').slice(0, -1).join('/') + '/' + decodeURIComponent(allImages[i].src);
            if (!(ignored(imgPath) || await isDark(imgPath))) {
                const dotIndex = allImages[i].src.lastIndexOf('.');
                allImages[i].src = allImages[i].src.slice(0,dotIndex) + ' darkmode' + allImages[i].src.slice(dotIndex);
            }
        }
        convertedDarkmode = dummy.innerHTML.toString();

        fs.writeFileSync(lightmodeHtml, fs.readFileSync('./app/utils/headers/lightmodeHeader.txt', 'utf8') + converted_html);
        fs.writeFileSync(darkmodeHtml, fs.readFileSync('./app/utils/headers/darkmodeHeader.txt', 'utf8') + convertedDarkmode);

        // PDF conversion
        messageQueue.push(`Converting ${filepath.split('files/')[1]} to pdf`);
        await processNextMessage();
        const darkmodePdf = darkmodeHtml.replace('.html', '.pdf');
        const lightmodePdf = lightmodeHtml.replace('.html', '.pdf');
        let convertedToPdf = false
        let retryCount = 0;
        do {  // Any errors - we retry up to <retryLimit> times
            try {
                await (async () => {  // Conversion for lightmode
                        await page.goto("file://" + lightmodeHtml);
                        const height = await page.evaluate(() => document.documentElement.offsetHeight);
                        await page.pdf({
                            path: lightmodePdf,
                            margin: {"top": "0cm", "right": "0cm", "bottom": "0cm", "left": "0cm"},
                            printBackground: true,
                            width: "210mm",
                            height: height + 'px'
                        });
                    }
                )();
                await (async () => {  // Conversion for darkmode
                        await page.goto("file://" + darkmodeHtml);
                        const height = await page.evaluate(() => document.documentElement.offsetHeight);
                        await page.pdf({
                            path: darkmodePdf,
                            margin: {"top": "0cm", "right": "0cm", "bottom": "0cm", "left": "0cm"},
                            printBackground: true,
                            width: "210mm",
                            height: height + 'px'
                        });
                    }
                )();
                convertedToPdf = true;
            } catch (error) {
                console.log(`Encountered an error while converting to PDF - retrying: `, error);
                fs.appendFileSync('filedir.log', `Encountered an error while converting to PDF - retrying: ${error}`);
                ++retryCount;
            }
        } while (!convertedToPdf && retryCount < retryLimit);
    } else if (filepath.endsWith('.html') || filepath.endsWith('.pdf') || filepath.endsWith('.gif')) {
        // Found something already converted - skip
        console.log('.html or .pdf of .gif file detected - unwatching');
        fs.appendFileSync('filedir.log', '.html or .pdf of .gif file detected - unwatching');
        watcher.unwatch(filepath);
    } else {
        // Unsupported file - delete for disk space sake
        execSync(`rm "${filepath}"`);
        messageQueue.push('Unsupported file extension: ', filepath.split('.')[1]);
        await processNextMessage();
        messageQueue.push('Deleted file with unsupported extension: ', filepath);
        await processNextMessage();
    }
    await new Promise(resolve => setTimeout(resolve, 50));
}

function ignored(filepath: string): boolean {
    const toIgnore = fs.readFileSync(darkModeIgnorePath, 'utf-8');
    return toIgnore.includes(<string>filepath.split('/').at(-1));
}

async function isDark (imgPath: string): Promise<boolean> {
    const img = await Image.load(imgPath);
    const grayscale = img.grey();
    return grayscale.getMean()[0] < 150;
}

function calculateFileHash(filepath: string): string {
    const data = fs.readFileSync(filepath, 'utf8');
    return createHash('md5').update(data).digest('hex');
}