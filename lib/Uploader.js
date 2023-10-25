import util from 'util'
import multer from 'multer'

export class Uploader {

    constructor() {
        const storageOptions = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, 'uploads/')
              },
              filename: (req, file, cb) => {
                cb(null, Date.now() + '-' + file.originalname)
              }
        });
        this.upload = multer({ storage: storageOptions })
    }
    async startUpload(req, res) {
        try {
            const upload = util.promisify(this.upload.any())
            await upload(req, res)
            return req.files[0].filename
        } catch (e) {
            console.log(e)
        }
    }
}
