import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { userApi } from "@/api";
import { AppThunk } from "@/store";

const initialState: StorageType.UserInfo = {
  ID: 0,
  username: "",
  nickName: "",
  headerImg: "",
  authorityId: 0,
  createdAt: "",
  updatedAt: "",
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    // 设置用户信息
    setUserInfo(state, { payload }: PayloadAction<StorageType.UserInfo>) {
      // 同时更新 localStorage
      return payload;
    },
    // 更新用户信息（部分更新）
    updateUserInfo(state, { payload }: PayloadAction<Partial<StorageType.UserInfo>>) {
      if (state) {
        const updatedUserInfo = { ...state, ...payload };
        // 同时更新 localStorage
        return updatedUserInfo;
      }
      return state;
    },
    // 清除用户信息
    clearUserInfo() {
      return initialState;
    },
  },
  selectors: {
    getUserInfo: (state) => state,
  },
});

//获取用户信息
export const getCurrentUserInfo = (): AppThunk => async (dispatch) => {
  const res = await userApi.getCurrentUser();
  if (res.code === 0 && res.data) {
    dispatch(userSlice.actions.setUserInfo(res.data));
  }
};
