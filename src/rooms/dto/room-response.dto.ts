class RoomBranchRefDto {
  id!: string;
  name!: string;
}

export class RoomResponseDto {
  id!: string;
  organizationId!: string;
  branchId!: string;
  name!: string;
  code!: string;
  capacity!: number;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  branch!: RoomBranchRefDto;
}
