export class LevelResponseDto {
  id!: string;
  courseId!: string;
  name!: string;
  code!: string;
  description!: string | null;
  order!: number;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CourseResponseDto {
  id!: string;
  organizationId!: string;
  name!: string;
  code!: string;
  description!: string | null;
  /** Decimal serialized as string. @example "450000" */
  monthlyPrice!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CourseListItemDto extends CourseResponseDto {
  levelsCount!: number;
}

export class CourseDetailDto extends CourseResponseDto {
  levels!: LevelResponseDto[];
}
