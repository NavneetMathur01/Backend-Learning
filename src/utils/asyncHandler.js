const asyncHandler = (requestHandler) => {
    return (req,res,next) =>{
        Promise.resolve(requestHandler(req,res,next)).catch((err)=>next(err))
    }
}


// const asyncHandler = () =>{}
// const asyncHandler = (func) =>{()=>{}} ye ur neeche wala same cheez h 
// const asyncHandler = (func) => () => {}


// const asyncHandler = (func) => async (req,res,next) => {
//     try {
//         await func(req,res,next)
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success:false,
//             message: error.message
//         })
//     }
// }


export {asyncHandler}