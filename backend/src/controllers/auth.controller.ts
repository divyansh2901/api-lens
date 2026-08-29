import { Request, Response } from "express";
import * as authService from "../services/auth.service.js";

export async function signup(req: Request, res: Response): Promise<void> {
  const result = await authService.signup(req.body);

  // 201 Created — a new resource (user) was created
  res.status(201).json({
    success: true,
    data: result,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);

  // 200 OK — login doesn't create a new resource
  res.status(200).json({
    success: true,
    data: result,
  });
}
