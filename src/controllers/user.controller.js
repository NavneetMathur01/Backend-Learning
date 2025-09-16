import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"


const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        // console.log(user);
        
        const accessToken = user.generateAccessToken()
        // console.log(accessToken);
        
        const refreshToken = user.generateRefreshToken()
        // console.log("inside try block of generate function");
        
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave:false})

        return {accessToken,refreshToken}


    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating refresh and access tokens");
        
    }
}


const registerUser = asyncHandler( async (req,res)=>{
   // Steps for registering new user
   // 1. Get user details from frontend
   // 2. Validation - not empty
   // 3. Check if user already exists :username, email
   // 4. Check for images, check for avatar
   // 5. Upload them to cloudinary, avatar
   // 6. Create user object - create entry in DB
   // 7. remove password and refresh token field from response
   // 8. check for user creation
   // 9. return response

   const {fullname, email, username, password} = req.body
    // console.log("email:",email);

    if ([fullname,email,password,username].some((eachField)=>eachField?.trim()==="")) {
        throw new ApiError(400,"All field are required")
    }
    const existingUser = await User.findOne({
        $or:[{username},{email}]
    })

    if (existingUser) {
        throw new ApiError(409, "User with email or username already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400,"Avatar file is required")
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"user registered successfully")
    )


})

const loginUser = asyncHandler(async(req,res)=>{

// steps for login the user
// 1. take values from users (req body-> data)
// 2. check the value i.e. username and email from database and user entered are same or not
// 3. if matched login else error
// 4. check for the password also 
// 5. access token and refresh token
// 6. send cookies

    const {username,email,password} = req.body

    if(!username && !email){
        throw new ApiError(400,"Username or email is required");
        
    }

    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if(!user){
        throw new ApiError(404,"User not found")
    }

    const isPasswordValid =  await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401,"Password Incorrect")
    }

    console.log(user._id);
    

    const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,accessToken,refreshToken
            },
            "User Logged in Successfully"
        )
    )

})


const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{refreshToken:undefined}
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly:true,
        secure:true
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User Logged Out"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized Request");
        
    }
    
    try {
        const decodeToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodeToken?._id)
    
        if(!user){
            throw new ApiError(401,"Invalid Refresh Token");
            
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh Token is expired or used");
            
        }
    
        const options = {
            httpOnly:true,
            secure:true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
        
        return res
        .status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(200,{accessToken,refreshToken:newRefreshToken},"Access Token Refreshed Successfully")
        )
    
    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh token");
        
    }

})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword, newPassword}= req.body

    const user = await User.findById(req.user?._id)
    const isMyPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isMyPasswordCorrect){
        throw new ApiError(400,"Invalid Password");
        
    }
    user.password =  newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200,{},"password changed success fully"))

})

const getCurrentUser = asyncHandler(async(req,res)=>{
    // const currentUser = await User.findById(req.user?._id)
    // if(!currentUser){
    //     throw new ApiError(404,"User not Found");
    // } // ye mene socha tha

    return res
    .status(200)
    .json(new ApiResponse(200,req.user,"your details"))


})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullname,email} = req.body

    if(!fullname || !email){
        throw new ApiError(400,"all feilds are required");
        
    }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname,
                email:email
            }
        },
        {new:true}
    
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Details updated successfully"))

})

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400,"please attach a file");
        
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400,"Error while uploading on avatar");
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Avatar updated successfully"))


})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400,"File path not found");
                
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage){
        throw new ApiError(400,"Error while uploading");
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage:coverImage.url
            }
        },
        {
            new:true
        }
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,user,"Uploaded coverImage Successfully"))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}