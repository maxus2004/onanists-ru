import {Obsidian} from "./obsidian";

let obsidian = new Obsidian("https://onanists:onanists123@obsidian.servermaksa.ru");

async function delay(ms:number) {
  return await new Promise(resolve => setTimeout(resolve, ms));
}

console.log("getting all files...");
let files = await obsidian.getAllFilesList();
console.log(files);
for (let file of files){
    await obsidian.saveFile(file,"public/files/"+file);
}
let last_update_time = new Date()


while(true){
    await delay(1*60*1000);
    console.log("getting updated files...")
    files = await obsidian.getUpdatedFilesList(last_update_time);
    console.log(files);
    for (let file of files){
        await obsidian.saveFile(file,"public/files/"+file);
    }
    last_update_time = new Date()
}