declare global {
	namespace App {
		interface Locals {
			user?: {
				id: number;
				plexId: number;
				username: string;
				isAdmin: boolean;
			};
		}
	}
}

export {};
