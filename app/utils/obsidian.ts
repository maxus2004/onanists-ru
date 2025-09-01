import Nano from "nano";
import fs from "fs";
import path from "path"

export class Obsidian {
    db: Nano.DocumentScope<unknown>;

    constructor(url: string) {
        this.db = Nano(url).db.use("obsidian");

    }

    ensureDirectoryExistence(filePath:string) {
        var dirname = path.dirname(filePath);
        if (fs.existsSync(dirname)) {
            return true;
        }
        fs.mkdirSync(dirname, { recursive: true });
    }

    async getFile(path: string) {
        const base = await this.db.get(path.toLowerCase())
        const children = await this.db.fetch({ keys: base["children"] });
        if (base["type"] == "newnote") {
            let data = Buffer.alloc(base["size"])
            let writtenSize = 0;
            for (const child of children.rows) {
                Buffer.from(child["doc"]["data"], "base64").copy(data, writtenSize)
                writtenSize += child["size"]
            }
            return data
        } else if (base["type"] == "plain") {
            let data = ""
            for (const child of children.rows) {
                data += child["doc"]["data"];
            }
            return data
        } else {
            throw new Error('Unknown document type');
        }
    }

    async saveFile(db_path: string, fs_path: string) {
        const base = await this.db.get(db_path.toLowerCase())
        const children = await this.db.fetch({ keys: base["children"] });
        this.ensureDirectoryExistence(fs_path);
        if (base["type"] == "newnote") {
            const stream = fs.createWriteStream(fs_path);
            for (const child of children.rows) {
                stream.write(Buffer.from(child["doc"]["data"], "base64"))
            }
        } else if (base["type"] == "plain") {
            const stream = fs.createWriteStream(fs_path);
            for (const child of children.rows) {
                stream.write(child["doc"]["data"], "utf-8");
            }
        } else {
            throw new Error('Unknown document type');
        }
    }

    async getUpdatedFilesList(after: Date): Promise<string[]> {
        const result = await this.db.find({
            selector: {
                $and: [
                    { mtime: { "$gt": after.valueOf() } },
                    { deleted: { "$exists": false } },
                    {
                        $or: [
                            { _id: { "$lt": "obsydian_livesync_version" } },
                            { _id: { "$gt": "obsydian_livesync_version" } }
                        ]
                    },
                    {
                        $or: [
                            { _id: { "$lt": "h:" } },
                            { _id: { "$gte": "h;" } }
                        ]
                    },
                    {
                        $or: [
                            { _id: { "$lt": "i:" } },
                            { _id: { "$gte": "i;" } }
                        ]
                    }
                ]
            },
            limit: 1000000
        });

        const paths: string[] = result.docs.map(x => x["path"]);

        return paths;
    }

    async getAllFilesList(): Promise<string[]> {
        return await this.getUpdatedFilesList(new Date("2000-01-01T00:00:00"));
    }
}