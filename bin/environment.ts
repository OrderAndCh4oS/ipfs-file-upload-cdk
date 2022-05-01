require("dotenv").config();

export interface Environment {
    STAGE: string,
    DOMAIN_NAME: string,
    BUCKET_NAME: string,
    REGION: string,
    IPFS_URL: string,
    INFURA_PROJECT_ID: string,
    INFURA_SECRET: string,
}

const envs = {
    STAGE: process.env.STAGE || 'dev',
    DOMAIN_NAME: process.env.DOMAIN_NAME || 'http://localhost:3000',
    BUCKET_NAME: process.env.BUCKET_NAME || 'ipfs-uploads',
    REGION: process.env.REGION || 'eu-west-1',
    IPFS_URL: process.env.IPFS_URL || 'https://ipfs.infura.io:5001',
    INFURA_PROJECT_ID: process.env.INFURA_PROJECT_ID || '',
    INFURA_SECRET: process.env.INFURA_SECRET || '',
}

export default envs;
