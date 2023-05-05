const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { S3RequestPresigner } = require("@aws-sdk/s3-request-presigner");
const { createRequest } = require("@aws-sdk/util-create-request");
const { formatUrl } = require("@aws-sdk/util-format-url");
const { Upload } = require("@aws-sdk/lib-storage");

const express = require("express");
const cors = require("cors");
const multer = require('multer');
const { config } = require('dotenv');
const listingRoutes = require('./routes/listings');

// Bringing in dotenv variables
config();

const app = express();

const BUCKET_URL = process.env.BUCKET_BASE_URL;
// MIDDLEWARE: CORS
app.use(cors());
app.use(express.json());
app.use('/listings', listingRoutes);

// AWS SDK Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// MIDDLEWARE: Handle File Uploads
const upload = multer();

// POST: /upload-image
app.post("/upload-image", upload.single("image"), async (req, res) => {
  console.log("req:", req.data);
  try {
    const file = req.file;
    console.log("file:", file);
    const key = Date.now().toString() + "_" + file.originalname;
    const bucketName = process.env.AWS_S3_BUCKET_NAME;

    // Upload the file to S3
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: "inline",
      },
    });
    console.log("upload:", upload);
    await upload.done();

    // Generate a pre-signed URL for the uploaded file
    const presigner = new S3RequestPresigner(s3Client.config);
    const getObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const request = await createRequest(s3Client, getObjectCommand);
    const imageUrl = formatUrl(request, presigner);

    //TODO: fix .replace to remove baseurl
    res.send({
      message: "Image uploaded successfully",
      imageUrl: imageUrl.replace(BUCKET_URL, ""),
    });
  } catch (error) {
    res.status(500).send({
      message: "An error occurred while uploading the image",
      error: error.message,
    });
  }
});

// Start the Express server
app.listen(3001, () => {
  console.log("Express server is running on port 3001");
});
