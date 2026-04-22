import { UserRoleEnum } from './user-role-enum';

export interface UserModel {
  id?: number;
  subject?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  role?: UserRoleEnum;
}
