import chokidar from 'chokidar';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { Image } from 'image-js';
import { JSDOM } from 'jsdom';

const darkModeIgnorePath: string = path.join(process.cwd(), 'public/files/dark-mode-ignore.md')

const rootDir = process.cwd() + '/public/files';

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
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    filepath != undefined ? await processFile(filepath) : await new Promise(resolve => setTimeout(resolve, 100));
    threadTaken = false;
    processNext();
}

async function processFile(filepath: string): Promise<void> {
    // 1 - Check filetype
    // 2 - if .md - html + pdf both themes
    // 3 - if .png or .jpg - convert to darkmode
    // Otherwise - not supported
    if (filepath.endsWith('.png') || filepath.endsWith('.jpg')) {
        // Dark mode conversion

        if (ignored(filepath)) {
            console.log(`Ignoring file ${filepath.split('files/')[1]}: in ignore file, unwatching`);
            watcher.unwatch(filepath);
        } else if (await isDark(filepath) || filepath.includes('darkmode')) {
            console.log(`Ignoring file ${filepath.split('files/')[1]}: already dark, unwatching`);
            watcher.unwatch(filepath);
        } else {
            console.log(`Converting file ${filepath.split('files/')[1]}`);
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
            let filepath = allImages[i].src;
            if (!(ignored(filepath) || await isDark(filepath))) {
                const possibleExtensions = ['.png', '.jpg', '.gif'];
                possibleExtensions.forEach(extension => {
                    filepath = filepath.replace(extension, '%20darkmode' + extension);
                });
            }
            allImages[i].src = filepath;
        }
        convertedDarkmode = dummy.innerHTML.toString();

        fs.writeFileSync(lightmodeHtml, fs.readFileSync('./app/utils/headers/lightmodeHeader.txt', 'utf8') + converted_html);
        fs.writeFileSync(darkmodeHtml, fs.readFileSync('./app/utils/headers/darkmodeHeader.txt', 'utf8') + convertedDarkmode);

        // PDF conversion
        console.log(`Converting ${filepath.split('files/')[1]} to pdf`);
        const darkmodePdf = darkmodeHtml.replace('.html', '.pdf');
        const lightmodePdf = lightmodeHtml.replace('.html', '.pdf');
        const lightmodePdfConvert = (async () => {
                const browser = await puppeteer.launch();
                const page = await browser.newPage();
                await page.goto("file://" + lightmodeHtml);
                const height = await page.evaluate(() => document.documentElement.offsetHeight);
                await page.pdf({
                    path: lightmodePdf,
                    margin: {"top": "0cm", "right": "0cm", "bottom": "0cm", "left": "0cm"},
                    printBackground: true,
                    width: "210mm",
                    height: height + 'px'
                });
                await browser.close();
            }
        )();
        const darkmodePdfConvert = (async () => {
                const browser = await puppeteer.launch();
                const page = await browser.newPage();
                let loaded: boolean = false
                do {
                    try {
                        await page.goto("file://" + darkmodeHtml);
                        loaded = true;
                    } catch (err) {
                        console.log("Encountered an error - retrying: ", err)
                    }
                } while (!loaded);
                const height = await page.evaluate(() => document.documentElement.offsetHeight);
                await page.pdf({
                    path: darkmodePdf,
                    margin: {"top": "0cm", "right": "0cm", "bottom": "0cm", "left": "0cm"},
                    printBackground: true,
                    width: "210mm",
                    height: height + 'px'
                });
                await browser.close();
            }
        )();
        let convertedToPdf = false
        do {                               // Any errors - we retry (for now no limit, will set later)
            try {                          // TODO: set retry limit
                await lightmodePdfConvert;
                await darkmodePdfConvert;
                convertedToPdf = true;
            } catch (error) {
                console.log(`Encountered an error while converting to PDF - retrying: `, error);
            }
        } while (!convertedToPdf);
    } else if (filepath.endsWith('.html') || filepath.endsWith('.pdf') || filepath.endsWith('.gif')) {
        // Found something already converted - skip
        console.log('.html or .pdf of .gif file detected - unwatching');
        watcher.unwatch(filepath);
    } else {
        // Unsupported file - delete for disk space sake
        execSync(`rm "${filepath}"`);
        console.log('Unsupported file extension: ', filepath.split('.')[1])
        console.log('Deleted file with unsupported extension: ', filepath);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
}

function ignored(filepath: string): boolean {
    const toIgnore = fs.readFileSync(darkModeIgnorePath, 'utf-8');
    return toIgnore.includes(filepath.split('/')[filepath.split('/').length - 1]);
    // ^ I know calling .split() twice is suboptimal, but it is easier and more dEmUrE
}

async function isDark (imgPath: string): Promise<boolean> {
    const img = await Image.load(imgPath);
    const grayscale = img.grey();
    return grayscale.getMean()[0] < 150;
}