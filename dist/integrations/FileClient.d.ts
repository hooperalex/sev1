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
export interface FileInfo {
    path: string;
    name: string;
    extension: string;
    size: number;
    isDirectory: boolean;
    modifiedAt: Date;
}
export declare class FileClient {
    private baseDir;
    constructor(baseDir?: string);
    /**
     * Read file contents
     */
    readFile(filePath: string): Promise<string>;
    /**
     * Write file contents (creates directories if needed)
     */
    writeFile(filePath: string, content: string): Promise<void>;
    /**
     * Append content to file
     */
    appendFile(filePath: string, content: string): Promise<void>;
    /**
     * Delete file
     */
    deleteFile(filePath: string): Promise<void>;
    /**
     * Check if file exists
     */
    exists(filePath: string): boolean;
    /**
     * Get file info
     */
    getFileInfo(filePath: string): Promise<FileInfo>;
    /**
     * List directory contents
     */
    listDirectory(dirPath?: string): Promise<FileInfo[]>;
    /**
     * Create directory
     */
    createDirectory(dirPath: string): Promise<void>;
    /**
     * Copy file
     */
    copyFile(sourcePath: string, destPath: string): Promise<void>;
    /**
     * Move/rename file
     */
    moveFile(sourcePath: string, destPath: string): Promise<void>;
    /**
     * Resolve relative path to absolute path
     */
    private resolvePath;
    /**
     * Get base directory
     */
    getBaseDir(): string;
    /**
     * Set base directory
     */
    setBaseDir(baseDir: string): void;
}
//# sourceMappingURL=FileClient.d.ts.map