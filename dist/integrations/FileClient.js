"use strict";
/**
 * FileClient: Handles file system operations
 *
 * Provides safe file operations:
 * - Read files
 * - Write files
 * - Create directories
 * - Check file existence
 * - List directory contents
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileClient = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
class FileClient {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
        logger_1.logger.info('FileClient initialized', { baseDir });
    }
    /**
     * Read file contents
     */
    async readFile(filePath) {
        try {
            const absolutePath = this.resolvePath(filePath);
            logger_1.logger.debug('Reading file', { filePath: absolutePath });
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            const content = fs.readFileSync(absolutePath, 'utf-8');
            logger_1.logger.debug('File read successfully', { filePath: absolutePath, size: content.length });
            return content;
        }
        catch (error) {
            logger_1.logger.error('Failed to read file', { filePath, error: error.message });
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Write file contents (creates directories if needed)
     */
    async writeFile(filePath, content) {
        try {
            const absolutePath = this.resolvePath(filePath);
            logger_1.logger.debug('Writing file', { filePath: absolutePath, size: content.length });
            // Create parent directory if it doesn't exist
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger_1.logger.debug('Created directory', { directory: dir });
            }
            fs.writeFileSync(absolutePath, content, 'utf-8');
            logger_1.logger.info('File written successfully', { filePath: absolutePath, size: content.length });
        }
        catch (error) {
            logger_1.logger.error('Failed to write file', { filePath, error: error.message });
            throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Append content to file
     */
    async appendFile(filePath, content) {
        try {
            const absolutePath = this.resolvePath(filePath);
            logger_1.logger.debug('Appending to file', { filePath: absolutePath, size: content.length });
            fs.appendFileSync(absolutePath, content, 'utf-8');
            logger_1.logger.info('Content appended successfully', { filePath: absolutePath });
        }
        catch (error) {
            logger_1.logger.error('Failed to append to file', { filePath, error: error.message });
            throw new Error(`Failed to append to file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Delete file
     */
    async deleteFile(filePath) {
        try {
            const absolutePath = this.resolvePath(filePath);
            logger_1.logger.debug('Deleting file', { filePath: absolutePath });
            if (!fs.existsSync(absolutePath)) {
                logger_1.logger.warn('File not found, skipping delete', { filePath: absolutePath });
                return;
            }
            fs.unlinkSync(absolutePath);
            logger_1.logger.info('File deleted successfully', { filePath: absolutePath });
        }
        catch (error) {
            logger_1.logger.error('Failed to delete file', { filePath, error: error.message });
            throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Check if file exists
     */
    exists(filePath) {
        const absolutePath = this.resolvePath(filePath);
        return fs.existsSync(absolutePath);
    }
    /**
     * Get file info
     */
    async getFileInfo(filePath) {
        try {
            const absolutePath = this.resolvePath(filePath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            const stats = fs.statSync(absolutePath);
            const ext = path.extname(absolutePath);
            return {
                path: absolutePath,
                name: path.basename(absolutePath),
                extension: ext,
                size: stats.size,
                isDirectory: stats.isDirectory(),
                modifiedAt: stats.mtime
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get file info', { filePath, error: error.message });
            throw new Error(`Failed to get file info for ${filePath}: ${error.message}`);
        }
    }
    /**
     * List directory contents
     */
    async listDirectory(dirPath = '.') {
        try {
            const absolutePath = this.resolvePath(dirPath);
            logger_1.logger.debug('Listing directory', { dirPath: absolutePath });
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Directory not found: ${dirPath}`);
            }
            const entries = fs.readdirSync(absolutePath);
            const fileInfos = [];
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry);
                try {
                    const info = await this.getFileInfo(entryPath);
                    fileInfos.push(info);
                }
                catch (error) {
                    logger_1.logger.warn('Failed to get info for entry', { entry, error });
                }
            }
            logger_1.logger.debug('Directory listed', { dirPath: absolutePath, count: fileInfos.length });
            return fileInfos;
        }
        catch (error) {
            logger_1.logger.error('Failed to list directory', { dirPath, error: error.message });
            throw new Error(`Failed to list directory ${dirPath}: ${error.message}`);
        }
    }
    /**
     * Create directory
     */
    async createDirectory(dirPath) {
        try {
            const absolutePath = this.resolvePath(dirPath);
            logger_1.logger.debug('Creating directory', { dirPath: absolutePath });
            if (fs.existsSync(absolutePath)) {
                logger_1.logger.warn('Directory already exists', { dirPath: absolutePath });
                return;
            }
            fs.mkdirSync(absolutePath, { recursive: true });
            logger_1.logger.info('Directory created successfully', { dirPath: absolutePath });
        }
        catch (error) {
            logger_1.logger.error('Failed to create directory', { dirPath, error: error.message });
            throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
        }
    }
    /**
     * Copy file
     */
    async copyFile(sourcePath, destPath) {
        try {
            const absoluteSource = this.resolvePath(sourcePath);
            const absoluteDest = this.resolvePath(destPath);
            logger_1.logger.debug('Copying file', { source: absoluteSource, dest: absoluteDest });
            if (!fs.existsSync(absoluteSource)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }
            // Create destination directory if needed
            const destDir = path.dirname(absoluteDest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(absoluteSource, absoluteDest);
            logger_1.logger.info('File copied successfully', { source: absoluteSource, dest: absoluteDest });
        }
        catch (error) {
            logger_1.logger.error('Failed to copy file', { sourcePath, destPath, error: error.message });
            throw new Error(`Failed to copy file from ${sourcePath} to ${destPath}: ${error.message}`);
        }
    }
    /**
     * Move/rename file
     */
    async moveFile(sourcePath, destPath) {
        try {
            const absoluteSource = this.resolvePath(sourcePath);
            const absoluteDest = this.resolvePath(destPath);
            logger_1.logger.debug('Moving file', { source: absoluteSource, dest: absoluteDest });
            if (!fs.existsSync(absoluteSource)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }
            // Create destination directory if needed
            const destDir = path.dirname(absoluteDest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.renameSync(absoluteSource, absoluteDest);
            logger_1.logger.info('File moved successfully', { source: absoluteSource, dest: absoluteDest });
        }
        catch (error) {
            logger_1.logger.error('Failed to move file', { sourcePath, destPath, error: error.message });
            throw new Error(`Failed to move file from ${sourcePath} to ${destPath}: ${error.message}`);
        }
    }
    /**
     * Resolve relative path to absolute path
     */
    resolvePath(filePath) {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.resolve(this.baseDir, filePath);
    }
    /**
     * Get base directory
     */
    getBaseDir() {
        return this.baseDir;
    }
    /**
     * Set base directory
     */
    setBaseDir(baseDir) {
        this.baseDir = baseDir;
        logger_1.logger.info('Base directory changed', { baseDir });
    }
}
exports.FileClient = FileClient;
//# sourceMappingURL=FileClient.js.map