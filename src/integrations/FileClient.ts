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

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: Date;
}

export class FileClient {
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
    logger.info('FileClient initialized', { baseDir });
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const absolutePath = this.resolvePath(filePath);
      logger.debug('Reading file', { filePath: absolutePath });

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      logger.debug('File read successfully', { filePath: absolutePath, size: content.length });

      return content;

    } catch (error: any) {
      logger.error('Failed to read file', { filePath, error: error.message });
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Write file contents (creates directories if needed)
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const absolutePath = this.resolvePath(filePath);
      logger.debug('Writing file', { filePath: absolutePath, size: content.length });

      // Create parent directory if it doesn't exist
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug('Created directory', { directory: dir });
      }

      fs.writeFileSync(absolutePath, content, 'utf-8');
      logger.info('File written successfully', { filePath: absolutePath, size: content.length });

    } catch (error: any) {
      logger.error('Failed to write file', { filePath, error: error.message });
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Append content to file
   */
  async appendFile(filePath: string, content: string): Promise<void> {
    try {
      const absolutePath = this.resolvePath(filePath);
      logger.debug('Appending to file', { filePath: absolutePath, size: content.length });

      fs.appendFileSync(absolutePath, content, 'utf-8');
      logger.info('Content appended successfully', { filePath: absolutePath });

    } catch (error: any) {
      logger.error('Failed to append to file', { filePath, error: error.message });
      throw new Error(`Failed to append to file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const absolutePath = this.resolvePath(filePath);
      logger.debug('Deleting file', { filePath: absolutePath });

      if (!fs.existsSync(absolutePath)) {
        logger.warn('File not found, skipping delete', { filePath: absolutePath });
        return;
      }

      fs.unlinkSync(absolutePath);
      logger.info('File deleted successfully', { filePath: absolutePath });

    } catch (error: any) {
      logger.error('Failed to delete file', { filePath, error: error.message });
      throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  exists(filePath: string): boolean {
    const absolutePath = this.resolvePath(filePath);
    return fs.existsSync(absolutePath);
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
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

    } catch (error: any) {
      logger.error('Failed to get file info', { filePath, error: error.message });
      throw new Error(`Failed to get file info for ${filePath}: ${error.message}`);
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string = '.'): Promise<FileInfo[]> {
    try {
      const absolutePath = this.resolvePath(dirPath);
      logger.debug('Listing directory', { dirPath: absolutePath });

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const entries = fs.readdirSync(absolutePath);
      const fileInfos: FileInfo[] = [];

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        try {
          const info = await this.getFileInfo(entryPath);
          fileInfos.push(info);
        } catch (error) {
          logger.warn('Failed to get info for entry', { entry, error });
        }
      }

      logger.debug('Directory listed', { dirPath: absolutePath, count: fileInfos.length });
      return fileInfos;

    } catch (error: any) {
      logger.error('Failed to list directory', { dirPath, error: error.message });
      throw new Error(`Failed to list directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      const absolutePath = this.resolvePath(dirPath);
      logger.debug('Creating directory', { dirPath: absolutePath });

      if (fs.existsSync(absolutePath)) {
        logger.warn('Directory already exists', { dirPath: absolutePath });
        return;
      }

      fs.mkdirSync(absolutePath, { recursive: true });
      logger.info('Directory created successfully', { dirPath: absolutePath });

    } catch (error: any) {
      logger.error('Failed to create directory', { dirPath, error: error.message });
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Copy file
   */
  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      const absoluteSource = this.resolvePath(sourcePath);
      const absoluteDest = this.resolvePath(destPath);

      logger.debug('Copying file', { source: absoluteSource, dest: absoluteDest });

      if (!fs.existsSync(absoluteSource)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      // Create destination directory if needed
      const destDir = path.dirname(absoluteDest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(absoluteSource, absoluteDest);
      logger.info('File copied successfully', { source: absoluteSource, dest: absoluteDest });

    } catch (error: any) {
      logger.error('Failed to copy file', { sourcePath, destPath, error: error.message });
      throw new Error(`Failed to copy file from ${sourcePath} to ${destPath}: ${error.message}`);
    }
  }

  /**
   * Move/rename file
   */
  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      const absoluteSource = this.resolvePath(sourcePath);
      const absoluteDest = this.resolvePath(destPath);

      logger.debug('Moving file', { source: absoluteSource, dest: absoluteDest });

      if (!fs.existsSync(absoluteSource)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      // Create destination directory if needed
      const destDir = path.dirname(absoluteDest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(absoluteSource, absoluteDest);
      logger.info('File moved successfully', { source: absoluteSource, dest: absoluteDest });

    } catch (error: any) {
      logger.error('Failed to move file', { sourcePath, destPath, error: error.message });
      throw new Error(`Failed to move file from ${sourcePath} to ${destPath}: ${error.message}`);
    }
  }

  /**
   * Resolve relative path to absolute path
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.baseDir, filePath);
  }

  /**
   * Get base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Set base directory
   */
  setBaseDir(baseDir: string): void {
    this.baseDir = baseDir;
    logger.info('Base directory changed', { baseDir });
  }
}
