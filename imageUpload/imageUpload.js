const express = require("express")
const { bucket } = require("../database/database")
const router = express.Router()
const multer = require("multer")

const upload = multer()

router.post("/image_upload", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) throw new Error("Enter file");
      const blob = bucket.file(req.file.originalname);
      const allowedTypes = ["image/jpg" , "image/jpeg", "image/png"];
      if(allowedTypes.includes(req.file.mimetype) && req.file.size <= 2097152){
        const blobStream = blob.createWriteStream({
          metadata: {
            contentType: req.file.mimetype,
          },
        });
  
        blobStream.on("error", (error) =>
          res.status(400).send({ message: error.message })
        );
  
        blobStream.on("finish", () => {
          const publicUrl = `https://firebasestorage.googleapis.com/v0/b/thoughtcast-magic.appspot.com/o/${encodeURI(blob.name)}?alt=media`;
          res.send({ publicUrl });
        });

        blobStream.end(req.file.buffer);
      }else{
        if(!allowedTypes.includes(req.file.mimetype)){
          return res.status(400).json({
            error: "photo type is invalid, allowed types jpg, jpeg and png",
            success: false
          })
        }else{
          return res.status(400).json({
            error: "photo size too big, please reduce to under 2mb",
            success: false
          })
        }
        
      }

    } catch (error) {
      res.status(400).send({ message: error.message });
    }
});

module.exports = router
