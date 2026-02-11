export namespace config {
	
	export class RotatorConfig {
	    accounts: string[];
	    modelPriority: string[];
	    // Go type: struct { Low int "json:\"low\"" }
	    quotas: any;
	    autoRotate: boolean;
	    rotateInterval: number;
	    openclawBin: string;
	
	    static createFrom(source: any = {}) {
	        return new RotatorConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accounts = source["accounts"];
	        this.modelPriority = source["modelPriority"];
	        this.quotas = this.convertValues(source["quotas"], Object);
	        this.autoRotate = source["autoRotate"];
	        this.rotateInterval = source["rotateInterval"];
	        this.openclawBin = source["openclawBin"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppConfig {
	    rotator: RotatorConfig;
	    lastScan: string[];
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rotator = this.convertValues(source["rotator"], RotatorConfig);
	        this.lastScan = source["lastScan"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace engine {
	
	export class AgentInfo {
	    id: string;
	    name: string;
	    currentModel: string;
	    emoji: string;
	
	    static createFrom(source: any = {}) {
	        return new AgentInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.currentModel = source["currentModel"];
	        this.emoji = source["emoji"];
	    }
	}

}

export namespace scanner {
	
	export class WorkspaceInfo {
	    path: string;
	    hasConfig: boolean;
	    hasAuthProfiles: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.hasConfig = source["hasConfig"];
	        this.hasAuthProfiles = source["hasAuthProfiles"];
	    }
	}

}

