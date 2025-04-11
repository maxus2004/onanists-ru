import fs from 'fs';
import path from 'path';

export default function parseDirectories(localPath: string): string[] {
    const rootPath = path.join(process.cwd(), 'public/', decodeURIComponent(localPath));
    const readRoot = fs.readdirSync(rootPath, { withFileTypes: true });
    const result: string[] = [];
    readRoot.forEach(elem => {
        if (elem.isDirectory()) result.push(elem.name);
    });

    return result;
}

export function parseNoteFileNames(localPath: string): string[] {
    const rootPath = path.join(process.cwd(), 'public/files/', decodeURIComponent(localPath));
    const readRoot = fs.readdirSync(rootPath, { withFileTypes: true });
    const result: string[] = [];
    const filesOnly = readRoot.filter(file => file.isFile()).map(file => file.name);
    filesOnly.forEach(elem => {
        const extensionProt: string[] = elem.split('.');
        const extension = extensionProt[extensionProt.length - 1];
        if (extension == 'md') result.push(elem.slice(0, elem.length - 3));
    })
    return result
}