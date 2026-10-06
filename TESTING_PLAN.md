# Venus University — Pre-release testing plan

Run this after `npm run release`, in a test folder, before updating the executable you play from.

- **Desktop**: update a test folder with `npm run exe:update -- --to "D:\Venus Teste"` and start "Venus University.exe" from there; after everything passes, run `npm run exe:update` for the folder you play from.

These tests are not intended to catch everything, it just runs over high traffic areas to get bang-for-testing-buck.

You will need externally kept data for testing:
- A save on the second week, not on Monday. With a class available to attend and a project available to work on.
- A save on the Tuesday of midterm week, with a midterm to attend
- A save during spring break
- A save on the week after spring break
- A save on the Tuesday of finals week, with a final to attend
- A save on the Sunday night before final scores are posted
- A save on the night before graduation

## Desktop


### Main Menu and Setup 
- [ ] On the Set up text generation screen, click into Custom and enter `https://openrouter.ai/api/v1`. Verify that models show up.
- [ ] Click back to Google AI Studio and enter an API key. Select Gemini 3.8 flash. Save.
- [ ] Open logging by doing `Get-Content data/app.log -Wait -Tail 10` on the root
- [ ] Install missing and verify that everything installs properly. Continue to main menu past NSFW modal.
- [ ] Press F11 and make sure the window resizes, stopping at a minimum size and creating black bars when going past supported aspect ratio.
- [ ] Verify that version matches.
- [ ] In the packaged .exe (not in npm run dev), open the main menu with network. Verify the footer shows only the version (and the image generation notice if ComfyUI is missing), that Settings has no "Ask to update on launch", and that the exe's data/app.log has no "[update]" lines and data/update does not exist.
- [ ] Open credits and check that all supporters/testers are there.
- [ ] Verify the main menu has no X link and no "Support Development"; Feedback opens and Download log works; Credits lists the supporters.
- [ ] With the game open, start "Venus University.exe" again and verify no second window opens.
- [ ] Open Settings and click everything. Drag the music slider down to see that it still works.
- [ ] In Settings verify there is no "Remember my key" and that "Characters text photos" can be toggled.
- [ ] Open Settings from the main menu and click "Clean up photos". Verify it says how many photos and how many MB, cancel and verify nothing is deleted, click again and confirm. Verify the photo files are gone and that every photo in a conversation is still there.
- [ ] Open Settings inside a game and verify there is no "Clean up photos".
- [ ] While a photo is sending, quit to the menu and click "Clean up photos". Verify it refuses and the photo still arrives.

### Manage Characters
- [ ] Open manage characters and import a character. Click it and open Edit Character. Click through all expressions on each outfit. Open NSFW CG and room BG.
- [ ] Regenerate an expression, then an outfit, then the Room BG, then an NSFW CG. Change a tag for each one and verify that on the next regenerate, the tag is still there.
- [ ] Change the pose and generate a Custom outfit: jumpsuit.
- [ ] Test Fix Holes.
- [ ] Test Fix Fingers.
- [ ] Change every field on the right side and verify that Save changes works.
- [ ] Export the character and reimport it. Delete the duplicate.
- [ ] Generate a blank character. Scroll through the boxes and check that nothing is prefilled. Clean it up with unfinished characters.
- [ ] Generate a character, checking every box

### Game
- [ ] Create a quick start save and play to the first decision point. Return to main menu and continue.
- [ ] Create a New Game. Fill empty slots randomly. Delete a character. Add a non-default character. Start the game.
- [ ] Shuffle a few times on the heights screen. Change the height of a character and sort. Save.
- [ ] Change the name to `Taeyung Min` and put `an international super-celebrity famous for his hit single "Lovin it".` Set Charm to Godly and Body to Decent.
- [ ] Do the first decision. Play to the end of the reply. Scroll back and find a place to edit to completely contradict the LLM output, then input your own action.
- [ ] Press H to hide/show the UI.
- [ ] Hide the character. Change her outfit. Change the background.
- [ ] Open the pause menu with Right click and Esc. Check that Controls are still accurate.
- [ ] Click Report a bug. Check that Download log works.
- [ ] Save the game on the second line, play to the end, then load the manual save. Load the autosave.
- [ ] Interrupt an ending screen. Click the "Don't warn". Check that it's on the set-up screen. Keep playing, then interrupt the ending again later.
- [ ] Play to the end. Edit the memory. 
- [ ] Open Bunnyboard. Check Chats. Check Friends and request the girl met as a friend. Check updates and like some posts. Check profile and verify that girls met and tokens generated updated. Verify that Bio is there. Upload a profile picture.
- [ ] Open Calendar and click through to the end. Check some occasions.
- [ ] Play another scene. Edit the output so you end up sleeping with a girl. Check that she sends a friend request after. 
- [ ] Play until the requested girl's friend request comes back, and check her edited memory.
- [ ] Go to class. Load a game from inside that scene. Load back and attend the class. Create a scheduled date with a girl via editing.
- [ ] Apply for a part time job.
- [ ] Attend the scheduled date.
- [ ] Go to the job shift.
- [ ] Do a solo scene.
- [ ] In a dev build (`npm run dev`) with men in the roster, play a few weeks and press F9 now and then: crushes, couples, exes and rejections show up with dates.
- [ ] Load a save written before roster romance existed and check that it plays on, F9 showing nothing yet.
- [ ] In a dev build, cast a couple together in a scene, press F9 and check that the romance text sent with the call names them as a couple; a declaration the scene writes that the rules cannot take shows in F9's events as discarded, with the reason.
- [ ] Load a save from before couples recorded a fight date or the reader could find out about a crush, play a scene and check that it plays on without an error.
- [ ] Ask a girl for a photo. Verify "Sending photo…" shows first, then the picture, and that clicking it opens it full size.
- [ ] Ask a girl for a photo she would not send and verify she refuses, with no photo arriving.
- [ ] With a girlfriend at home, ask her for a sexy photo. Verify a sexy photo arrives.
- [ ] Quit to the menu, delete that photo's file from data/saves/<playthrough>/photos, load the save and open her conversation. Verify the photo is drawn again.
- [ ] Ask for another photo, and while "Sending photo…" is up, quit to the menu and delete that playthrough. Verify its folder under data/saves is gone and does not come back once the photo would have finished.
- [ ] While a photo is sending, end ComfyUI's python process in Task Manager. Verify the message says "Photo didn't send", then close and reopen the conversation and verify it sends.
- [ ] Hover a photo, click Regenerate, change a tag and confirm. Verify the old picture stays until the new one replaces it, and that a save from before still shows the old one.
- [ ] Regenerate a photo again with "Use a new random seed" unticked, keeping its seed, and one tag changed. Verify both files are in data/saves/<playthrough>/photos.
- [ ] Open Regenerate on a photo whose tags were changed and click "Reset to default tags". Verify the tags go back to the ones the photo was first drawn with.
- [ ] Turn off "Characters text photos" in Settings, ask a girl for a photo and verify none arrives. Turn it back on.
- [ ] Play until a girl's invitation arrives with a photo. Verify "Sending photo…" shows first, then the picture, and that it matches where BunnyMap places her.
- [ ] Hover that invitation's photo, click Regenerate and confirm. Verify the new picture replaces the old one.
- [ ] Right after an invitation with a photo arrives, load the autosave and play into the new slot again. Verify the same invitation arrives once, with the same picture.
- [ ] Load that autosave again, turn off "Characters text photos" and play into the new slot. Verify the invitation arrives without a photo. Turn it back on.
- [ ] When a girl invites you while BunnyMap shows her nowhere that slot, verify her invitation came without a photo.
- [ ] Post something on the Updates tab, play into the next slot and verify likes arrive on your post.
- [ ] Verify the post box says why it is shut: during a scene, on the goodbye menu, and after you already posted that half of the day.
- [ ] Post something and delete it with the ✕ before starting the scene. Verify it is gone and you can post again.
- [ ] Verify your post shows your profile picture, then remove the picture and verify it shows the plain face.
- [ ] Post something, play to the end of the scene, load the autosave and play into the next slot. Verify the same likes arrive once.
- [ ] Post something, play into the next slot and verify replies arrive under the post with the likes, each contact with her face and @, anonymous replies with an emoji.
- [ ] Right after the replies arrive, load the autosave and play into the slot again. Verify the same replies arrive once.
- [ ] In a dev build, use F9 to make the next feed replies call fail. Verify the post keeps waiting, likes included, and both arrive in a later slot.
- [ ] Have a contact block you after your post and before the next slot. Verify her reply does not appear.
- [ ] Comment on a contact's post from today, play into the next slot and verify her reply arrives under your comment, with her face and @, and that her page shows both.
- [ ] Leave 3 comments in one half of the day and verify the box says why it is shut. Delete one and verify you can comment again.
- [ ] Right after a reply to your comment arrives, load the autosave and play into the slot again. Verify the same reply arrives once.
- [ ] In a dev build, use F9's "Affection of X for the reader = N" with N = -40 to make a contact hostile, comment on her post and verify no reply ever comes.
- [ ] Comment on a contact's post asking her out and verify her reply neither accepts nor sets a day, time or place.
- [ ] In a dev build, use F9's "X tags the reader at the next ending" during a public scene with X, play into the next slot and verify her post appears with "with @your_handle" under it, and "tagged you" on her page.
- [ ] Right after a tagged post arrives, load the autosave and play into the slot again. Verify the post appears once.
- [ ] In a dev build, force a tag and kiss someone in that scene. Verify F9 says why the scene tags nobody and no post comes.
- [ ] In a dev build, force a tag during a hangout arranged by text with somebody who is not your girlfriend. Verify no tag comes.
- [ ] In a dev build, force a tag and make the next feed replies call fail. Verify no tagged post ever arrives.
- [ ] Comment on a tagged post, play into the next slot and verify her reply arrives under your comment.
- [ ] Post something, play into the next slot so a contact replies, then finish the next scene. Open her page and verify a memory ending "on Bunnyboard" that says only what you wrote and how she took it.
- [ ] Comment on a contact's post, play into the next slot until she replies, finish the next scene and verify the same kind of memory.
- [ ] In a dev build, find the phone summary's prompt in `data/app.log` and verify it has a THE FEED block with your post and her reply, and that her post under your comment is marked context only.
- [ ] Get a reply where she states a fact (for example comment "where are you?" on her post). Verify the memory does not repeat the fact.
- [ ] Text a contact and also exchange on the feed with her in the same slot. Verify she has one memory, not two.
- [ ] Let a contact tag you and do not comment on the post. Verify no "on Bunnyboard" memory comes of it.
- [ ] Load a save from before the feed memories, play a scene and verify it plays on without an error.
- [ ] In a dev build, post a test line for a contact with F9's "Y posts a test line this slot", set "Affinity of X and Y = 8", use "X comments on Y's post at the next ending", finish a scene and verify X's comment appears under Y's post with her face, name and @, with no like and no reply under it, and that Y's page shows it read-only.
- [ ] Right after a character's comment arrives, load the autosave and play into the slot again. Verify the comment appears once.
- [ ] In a dev build, force a comment and make the next feed replies call fail. Verify no comment arrives, now or in later slots.
- [ ] In a dev build, force a comment from a contact who has blocked you, and then from one with a crush on the poster. Verify no comment arrives and F9 says why.
- [ ] In a dev build, force a contact to tag you and another to comment on that post. Verify F9 says the post tags the reader and no comment arrives.
- [ ] Comment on a post that already has a character's comment. Verify her reply arrives under your comment and the character's comment stays above it.
- [ ] Load a save from before characters commented on each other's posts, play a scene and verify it plays on without an error.
- [ ] Play two scenes with a contact you can name, leaving her with good memories. Open her page and verify the Breakthrough bar has risen, and that a contact whose name you do not know shows no bar.
- [ ] Load a save written before the Breakthrough bar and verify the bar is empty on every contact page.
- [ ] Edit a memory from a half of the day that holds only that one memory, changing it to a worse verb, and verify the bar goes down; delete it and verify it goes down again.
- [ ] In a dev build, open F9 and verify the Breakthrough meter section lists every character with her meter and how many of her memories carry no half of the day, a man as well as a woman.
- [ ] In a dev build, fill a contact's Breakthrough with F9, start a scene with her and verify there is no Breakthrough button on the first action and one from the second, and that she is outlined.
- [ ] Use Breakthrough with a direction, verify the outline and the bar clear at once, that the button is gone for her in the same scene, and that the instruction and the direction are in the scene call in data/app.log for that turn only.
- [ ] Rewind a few lines before a Breakthrough turn and interject. Verify the use is cut and she is outlined again.
- [ ] Make a Breakthrough turn fail and retry it. Verify the instruction is sent again; cancel it and verify the typed words come back.
- [ ] Use Breakthrough with a man and verify the instruction says the advance is friendship, trust or respect.
- [ ] Load a save written before Breakthrough and play a scene. Verify it plays on without an error.
- [ ] Use Breakthrough in a scene and finish it. Verify the summary says how it went, that the marked memory is on the memory screen at the boundary and then on her page, and that her bar stays empty.
- [ ] Load a save from before Breakthrough results and play a scene. Verify it plays on without an error.
- [ ] Use Breakthrough, finish the scene and kill the app once the ending has been written. Continue and verify the marked memory is on the memory screen once and, after Save, on her page once.
- [ ] Use Breakthrough, finish the scene and kill the app with the memory screen open. Continue and verify the screen asks again with the marked row, and that her page holds one marked memory.
- [ ] With the provider set to Gemini, finish a scene with a crush, a use and (in a second scene) a class. Verify no INVALID_ARGUMENT in data/app.log.
- [ ] Edit the marked memory on the memory screen and on her page, and blank it on the memory screen. Verify the sticker stays through an edit and the memory is gone after the blank.
- [ ] Play three scenes with one contact in different places. In data/app.log verify the next scene's cast block lists her three encounters in order, and that a contact who was not there has none.
- [ ] In a scene of three, let one leave before the end. Verify that in the next scene she has the encounter without its text.
- [ ] With more encounters than the newest half carries text for, verify in data/app.log that the newest have their summary and the older ones only the day, the place and who was there.
- [ ] Load a save from before encounters kept who and where, play a scene and verify it plays on without an error.

### Second Week
- [ ] Attend class and verify that a fact is learned. 
- [ ] Work on a project.
- [ ] Start a hangout through a text.

### Midterms
- [ ] Open Bunnymap and click into Lowrise. Verify that it's either the kitchen or the lounge.
- [ ] Open Bunnyshop and trigger a gameover by buying too many things.
- [ ] Ditch midterms, buy something in the Bunnyshop, and gift someone something.
- [ ] Attend midterms. Check the log for the correct answers. Do a correct answer and an incorrect answer.

### Spring Break
- [ ] Open Bunnymap and check that certain girls are unavailable.
- [ ] Open the Calendar and check for rainy days and play one.

### After Spring Break
- [ ] Open Bunnymap and check that everyone is back.
- [ ] Go to classes and verify that scores are handed back.

### Finals
- [ ] Attend finals.

### Graduation and Goodbyes
- [ ] Attend graduation, click through a goodbye, then go home.
- [ ] Back up game data. Close the game, run `npm run exe:remove -- --to "D:\Venus Teste"` and then `npm run exe:update -- --to "D:\Venus Teste"`, open the exe, enter an API key, restore the backup and verify that everything is there.
