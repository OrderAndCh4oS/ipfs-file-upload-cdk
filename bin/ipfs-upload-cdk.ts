#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { IpfsUploadCdkStack } from '../lib/ipfs-upload-cdk-stack';
import envs from './environment';

const app = new cdk.App();
new IpfsUploadCdkStack(app, 'IpfsUploadCdkStack', {}, envs);
