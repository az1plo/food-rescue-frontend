import { UserRoleEnum } from './user-role-enum';

export interface UserModel {
  subject?: string;
  email?: string;
  name: string;
  role?: UserRoleEnum;
}
