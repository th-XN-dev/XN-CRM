import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto, PaginationMetaDto } from './common-responses.dto';

/** Documents `{ success: true, data: <model> }`. */
export function ApiEnvelopeResponse(
  model: Type<unknown>,
  status: HttpStatus = HttpStatus.OK,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: getSchemaPath(model) },
        },
      },
    }),
  );
}

/** Documents `{ success: true, data: <model>[] }` (short, unpaginated lists). */
export function ApiEnvelopeArrayResponse(model: Type<unknown>): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: HttpStatus.OK,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
        },
      },
    }),
  );
}

/** Documents `{ success: true, data: { items: <model>[], meta } }`. */
export function ApiPaginatedResponse(model: Type<unknown>): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiResponse({
      status: HttpStatus.OK,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            properties: {
              items: { type: 'array', items: { $ref: getSchemaPath(model) } },
              meta: { $ref: getSchemaPath(PaginationMetaDto) },
            },
          },
        },
      },
    }),
  );
}

/** Documents an error envelope for the given status. */
export function ApiErrorResponse(
  status: HttpStatus,
  description: string,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ApiResponse({ status, description, type: ErrorResponseDto }),
  );
}
