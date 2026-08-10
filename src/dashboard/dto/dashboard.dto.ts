export class DashboardDto {
    total = 0;
    present = 0;
    leave = 0;
    late = 0;

    executives: {
        id: string;
        fullName: string;
        currLoc?: {
            lat: number;
            lng: number;
        };
    }[] = [];
}