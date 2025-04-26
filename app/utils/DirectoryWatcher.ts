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
const fileHashes = new Map<string, string>();
const browser = await puppeteer.launch();
const page = await browser.newPage();
fs.writeFileSync('hash.log', '');    // Wipe the hash log file
fs.writeFileSync('filedir.log', ''); // Wipe the directory wacther log file

const watcher = chokidar.watch(rootDir, {
    persistent: true,
    ignored: /^\./,
    usePolling: true,
    interval: 1000,
    binaryInterval: 3000,
    awaitWriteFinish: true
});
console.log(`Watching directory: ${rootDir}`);

const queue: string[] = [];
let threadTaken = false;

watcher
    .on('add', (filepath) => {
        console.log(`Added file: ${filepath.split('files/')[1]}`);
        queue.push(filepath);
        processNext();
    })
    .on('change', (filepath) => {
        console.log(`Changed file: ${filepath.split('files/')[1]}`);
        queue.push(filepath);
        processNext();
    });

async function processNext(): Promise<void> {
    if (threadTaken || queue.length === 0) {
        return;
    }
    threadTaken = true;
    const filepath = queue.shift();
    if (filepath){
        // Check the hash & process
        const hash: string = calculateFileHash(filepath);
        if (fileHashes.has(filepath) && fileHashes.get(filepath) == hash) {
            console.log("File hashes match - ignoring file " + filepath);
            fs.appendFileSync('hash.log', `Hash match for ${filepath}\n`)
            threadTaken = false;
            return;
        }
        fileHashes.set(filepath, hash);
        fs.appendFileSync('hash.log', `Hash set for ${filepath}\n`);
        await processFile(filepath);
    } else {
        console.log("Bad file path");
        threadTaken = false;
        return;
    }
    threadTaken = false;
    await processNext();
}

async function processFile(filepath: string): Promise<void> {
    // 1 - Check filetype
    // 2 - if .md - html + pdf both themes
    // 3 - if .png .jpg - convert to darkmode
    // 4 - .gif - do nothing
    // 5 - Contains 'darkmode' or 'lightmode' - unwatch
    // Otherwise - not supported

    if (filepath.includes('lightmode') || filepath.includes('darkmode')) {
        console.log('Darkmode/lightmode file detected - unwatching');
        fs.appendFileSync('filedir.log', 'Darkmode/lightmode file detected - unwatching\n');
        watcher.unwatch(filepath);
    } else if (filepath.endsWith('.png') || filepath.endsWith('.jpg')) {
        // Dark mode conversion

        if (ignored(filepath)) {
            console.log(`Ignoring file ${filepath.split('files/')[1]}: in ignore file, unwatching`);
            fs.appendFileSync('filedir.log', `Ignoring file ${filepath.split('files/')[1]}: in ignore file, unwatching\n`);
            watcher.unwatch(filepath);
        } else if (await isDark(filepath)) {
            console.log(`Ignoring file ${filepath.split('files/')[1]}: already dark, unwatching`);
            fs.appendFileSync('filedir.log', `Ignoring file ${filepath.split('files/')[1]}: already dark, unwatching\n`);
            watcher.unwatch(filepath);
        } else {
            console.log(`Converting file ${filepath.split('files/')[1]}`);
            fs.appendFileSync('filedir.log', `Converting file ${filepath.split('files/')[1]}\n`);
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
        console.log(`Converting ${filepath.split('files/')[1]} to html`);
        fs.appendFileSync('filedir.log', `Converting ${filepath.split('files/')[1]} to html\n`);
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
        console.log(`Converting ${filepath.split('files/')[1]} to pdf`);
        fs.appendFileSync('filedir.log', `Converting ${filepath.split('files/')[1]} to pdf\n`);
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
                fs.appendFileSync('filedir.log', `Encountered an error while converting to PDF - retrying: ${error}\n`);
                ++retryCount;
            }
        } while (!convertedToPdf && retryCount < retryLimit);
    } else if (filepath.endsWith('.html') || filepath.endsWith('.pdf') || filepath.endsWith('.gif')) {
        // Found something already converted - skip
        console.log('.html or .pdf of .gif file detected - unwatching');
        fs.appendFileSync('filedir.log', '.html or .pdf of .gif file detected - unwatching\n');
        watcher.unwatch(filepath);
    } else {
        // Unsupported file - delete for disk space sake
        execSync(`rm "${filepath}"`);
        console.log('Unsupported file extension: ', filepath.split('.')[1]);
        fs.appendFileSync('filedir.log', 'Unsupported file extension: ' + filepath.split('.')[1] + '\n');
        console.log('Deleted file with unsupported extension: ', filepath);
        fs.appendFileSync('filedir.log', 'Deleted file with unsupported extension: ' + filepath + '\n');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
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