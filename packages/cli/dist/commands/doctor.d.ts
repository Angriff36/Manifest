interface CommonOptions {
    json?: boolean;
    src?: string;
    irRoot?: string[];
}
interface InspectEntityOptions extends CommonOptions {
}
interface DiffSourceVsIROptions extends CommonOptions {
}
interface DuplicatesOptions {
    json?: boolean;
    entity?: string;
    mergeReport?: string;
}
interface RuntimeCheckOptions extends CommonOptions {
    route?: string;
}
interface CacheStatusOptions extends CommonOptions {
    entity?: string;
    command?: string;
}
interface DoctorOptions extends RuntimeCheckOptions {
    entity?: string;
    command?: string;
}
export declare function inspectEntityCommand(entityName: string, options?: InspectEntityOptions): Promise<void>;
export declare function diffSourceVsIRCommand(entityName: string, options?: DiffSourceVsIROptions): Promise<void>;
export declare function duplicatesCommand(options?: DuplicatesOptions): Promise<void>;
export declare function runtimeCheckCommand(entityName: string, commandName: string, options?: RuntimeCheckOptions): Promise<void>;
export declare function cacheStatusCommand(options?: CacheStatusOptions): Promise<void>;
export declare function doctorCommand(options?: DoctorOptions): Promise<void>;
export {};
//# sourceMappingURL=doctor.d.ts.map