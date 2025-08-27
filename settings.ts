export interface HelloPluginSettings {
    tableSeparators: string[];
}

export const DEFAULT_SETTINGS: HelloPluginSettings = {
    tableSeparators: ["-", "|"]
};
